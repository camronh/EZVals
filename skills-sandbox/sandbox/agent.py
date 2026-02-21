"""AcmeBot - Customer support agent for Acme Electronics."""

from tools import search_knowledge_base, lookup_order, calculate_refund


def run_agent(query, conversation_history=None):
    """Run the support agent and return structured results.

    Args:
        query: The customer's message.
        conversation_history: Optional list of previous message dicts
            [{"role": "user"|"assistant", "content": "..."}]

    Returns:
        dict with keys: response, sources, tool_calls, messages
    """
    tool_calls = []
    sources = []
    query_lower = query.lower()

    # Route to the appropriate tool
    if any(oid.lower() in query_lower for oid in ["ord-1234", "ord-5678", "ord-9012"]):
        if "refund" in query_lower or "return" in query_lower:
            result = calculate_refund(query)
            tool_calls.append({"name": "calculate_refund", "input": query})
        else:
            result = lookup_order(query)
            tool_calls.append({"name": "lookup_order", "input": query})
    elif "refund" in query_lower or "return" in query_lower:
        result = calculate_refund(query)
        tool_calls.append({"name": "calculate_refund", "input": query})
    else:
        result = search_knowledge_base(query)
        tool_calls.append({"name": "search_knowledge_base", "input": query})

    sources = result.get("sources", [])
    response = result.get("response", "I can help with that.")

    # Build message history
    messages = list(conversation_history or [])
    messages.append({"role": "user", "content": query})
    messages.append({"role": "assistant", "content": response})

    return {
        "response": response,
        "sources": sources,
        "tool_calls": tool_calls,
        "messages": messages,
    }
