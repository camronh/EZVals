"""A fake support agent traced with OpenTelemetry: open a result and click Spans to see its waterfall."""
import asyncio

from opentelemetry import trace

from ezvals import EvalContext, eval

tracer = trace.get_tracer("support-agent")
ORDERS = {"A-1001": "refunded", "A-1002": "shipped"}


async def chat(model, prompt, tokens_in, tokens_out, seconds):
    """Stands in for an instrumented LLM call, which records the same gen_ai attributes."""
    with tracer.start_as_current_span(f"chat {model}") as span:
        span.set_attributes({"gen_ai.request.model": model, "gen_ai.usage.input_tokens": tokens_in, "gen_ai.usage.output_tokens": tokens_out})
        await asyncio.sleep(seconds)
        return prompt


async def lookup_order(order_id):
    with tracer.start_as_current_span("tool lookup_order") as span:
        span.set_attribute("order.id", order_id)
        await asyncio.sleep(0.05)
        return ORDERS[order_id]


async def support_agent(message):
    with tracer.start_as_current_span("agent.run"):
        await chat("claude-sonnet-5", message, 812, 64, 0.2)
        order_id = message.split()[-1]
        status = await lookup_order(order_id)
        await chat("claude-sonnet-5", status, 1034, 120, 0.25)
        return f"Order {order_id} is {status}."


@eval(dataset="support", cases=[
    {"input": "Where is my order A-1001", "reference": "refunded"},
    {"input": "Where is my order A-1002", "reference": "shipped"},
    {"input": "Where is my order A-9999", "reference": "not found"},
])
async def order_status(ctx: EvalContext):
    ctx.output = await support_agent(ctx.input)
    assert ctx.reference in ctx.output, f"Expected the status '{ctx.reference}'"
