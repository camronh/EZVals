# AcmeBot - Customer Support Agent

A Python customer support chatbot for Acme Electronics.

Entry point is `run_agent()` in `agent.py`. It takes a query string and optional conversation history, and returns a dict with `response`, `sources`, `tool_calls`, and `messages`.

Uses a knowledge base and tools for order lookup, refunds, and KB search. All product/policy data lives in `knowledge_base.py`.
