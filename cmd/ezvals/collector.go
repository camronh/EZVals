package main

import (
	"compress/gzip"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"sync"

	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/protobuf/proto"
)

// Collector receives OTLP/HTTP (protobuf) trace exports at /otlp/{run}/v1/traces. SDKs tag every span
// recorded during an eval with ezvals.eval_id, so each eval's spans are appended to its run as they arrive.
type Collector struct {
	mu   sync.Mutex
	runs map[string]func(...Event)
	// save handles runs nobody is tracking (e.g. spans flushed late to a run `serve` already finished).
	save func(runID string, events ...Event)
}

const (
	evalIDAttribute = "ezvals.eval_id"
	rootAttribute   = "ezvals.root" // set on the span each SDK wraps an eval (or regrade) in
)

func endpoint(base, runID string) string { return base + "/otlp/" + runID + "/v1/traces" }

func (c *Collector) Track(runID string, emit func(...Event)) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.runs == nil {
		c.runs = map[string]func(...Event){}
	}
	c.runs[runID] = emit
}

func (c *Collector) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body := io.Reader(r.Body)
	if r.Header.Get("Content-Encoding") == "gzip" {
		gz, err := gzip.NewReader(r.Body)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		body = gz
	}
	data, err := io.ReadAll(body)
	var export tracepb.TracesData // same wire format as ExportTraceServiceRequest, without pulling in gRPC
	if err == nil {
		err = proto.Unmarshal(data, &export)
	}
	if err != nil {
		http.Error(w, fmt.Sprintf("expected an OTLP protobuf trace export: %v", err), 400)
		return
	}

	byEval := map[string][]Span{}
	var order []string
	for _, rs := range export.ResourceSpans {
		for _, ss := range rs.ScopeSpans {
			for _, s := range ss.Spans {
				attrs := attributeMap(s.Attributes)
				id, _ := attrs[evalIDAttribute].(string)
				if id == "" {
					continue
				}
				delete(attrs, evalIDAttribute)
				span := Span{TraceID: hex.EncodeToString(s.TraceId), SpanID: hex.EncodeToString(s.SpanId),
					ParentSpanID: hex.EncodeToString(s.ParentSpanId), Name: s.Name,
					Start: int64(s.StartTimeUnixNano), End: int64(s.EndTimeUnixNano), Attributes: attrs}
				switch s.GetStatus().GetCode() {
				case tracepb.Status_STATUS_CODE_ERROR:
					span.Status, span.StatusMessage = "error", s.Status.Message
				case tracepb.Status_STATUS_CODE_OK:
					span.Status = "ok"
				}
				if byEval[id] == nil {
					order = append(order, id)
				}
				byEval[id] = append(byEval[id], span)
			}
		}
	}

	runID := r.PathValue("run")
	c.mu.Lock()
	emit := c.runs[runID]
	c.mu.Unlock()
	for _, id := range order {
		event := Event{Type: "spans", ID: id, Spans: byEval[id]}
		if emit != nil {
			emit(event)
		} else if c.save != nil {
			c.save(runID, event)
		}
	}
	w.Header().Set("Content-Type", "application/x-protobuf")
}

func attributeMap(kvs []*commonpb.KeyValue) map[string]any {
	out := map[string]any{}
	for _, kv := range kvs {
		out[kv.Key] = attributeValue(kv.Value)
	}
	return out
}

func attributeValue(v *commonpb.AnyValue) any {
	switch v := v.GetValue().(type) {
	case *commonpb.AnyValue_StringValue:
		return v.StringValue
	case *commonpb.AnyValue_BoolValue:
		return v.BoolValue
	case *commonpb.AnyValue_IntValue:
		return v.IntValue
	case *commonpb.AnyValue_DoubleValue:
		return v.DoubleValue
	case *commonpb.AnyValue_BytesValue:
		return hex.EncodeToString(v.BytesValue)
	case *commonpb.AnyValue_ArrayValue:
		values := []any{}
		for _, item := range v.ArrayValue.Values {
			values = append(values, attributeValue(item))
		}
		return values
	case *commonpb.AnyValue_KvlistValue:
		return attributeMap(v.KvlistValue.Values)
	}
	return nil
}
