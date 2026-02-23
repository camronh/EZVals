"""Tools available to the AcmeBot agent."""

from knowledge_base import KB


def search_knowledge_base(query):
    """Search the knowledge base for relevant information."""
    query_lower = query.lower()
    results = []
    sources = []

    # Search products
    for name, product in KB["products"].items():
        if name.lower() in query_lower or product["category"] in query_lower:
            results.append(f"{name}: {product['description']} - ${product['price']}")
            sources.append(f"products/{name}")

    # Search policies
    for policy_name, policy_text in KB["policies"].items():
        if policy_name in query_lower or any(word in policy_text.lower() for word in query_lower.split()):
            results.append(f"{policy_name}: {policy_text}")
            sources.append(f"policies/{policy_name}")

    response = "\n".join(results) if results else "No relevant information found."
    return {"response": response, "sources": sources}


def lookup_order(query):
    """Look up an order by ID."""
    for order_id, order in KB["orders"].items():
        if order_id.lower() in query.lower():
            items_str = ", ".join(f"{i['product']} x{i['quantity']}" for i in order["items"])
            return {
                "response": f"Order {order_id}: {items_str}. Total: ${order['total']}. Status: {order['status']}. Customer: {order['customer']}.",
                "sources": [f"orders/{order_id}"],
            }
    return {"response": "Order not found.", "sources": []}


def calculate_refund(query):
    """Calculate refund amount for a return request."""
    for order_id, order in KB["orders"].items():
        if order_id.lower() in query.lower():
            return {
                "response": f"Refund for {order_id}: ${order['total']}. Per our policy, returns are accepted within 30 days of purchase. Order date: {order['date']}.",
                "sources": [f"orders/{order_id}", "policies/returns"],
            }
    return {"response": "Please provide an order ID to calculate the refund.", "sources": ["policies/returns"]}
