"""Acme Electronics knowledge base. All product and policy data."""

KB = {
    "products": {
        "UltraPhone X": {
            "price": 999.99,
            "category": "phones",
            "description": "Flagship smartphone with 256GB storage and OLED display",
            "warranty": "2 years",
        },
        "BasicCase": {
            "price": 49.99,
            "category": "accessories",
            "description": "Protective phone case for UltraPhone X",
            "warranty": "6 months",
        },
        "PowerDock Pro": {
            "price": 129.99,
            "category": "accessories",
            "description": "Wireless charging dock with fast-charge support",
            "warranty": "1 year",
        },
    },
    "policies": {
        "returns": "All products can be returned within 30 days of purchase for a full refund. Items must be in original packaging.",
        "shipping": "Standard shipping is free on orders over $50. Express shipping is $12.99 and arrives in 1-2 business days.",
        "support_hours": "Customer support is available Monday-Friday, 9am-5pm EST.",
        "escalation": "Requests involving billing disputes, account security, or legal matters must be escalated to a human agent.",
    },
    "orders": {
        "ORD-1234": {
            "customer": "Alice Johnson",
            "items": [{"product": "UltraPhone X", "quantity": 1, "price": 999.99}],
            "total": 999.99,
            "status": "delivered",
            "date": "2025-01-15",
        },
        "ORD-5678": {
            "customer": "Bob Smith",
            "items": [
                {"product": "BasicCase", "quantity": 2, "price": 49.99},
                {"product": "PowerDock Pro", "quantity": 1, "price": 129.99},
            ],
            "total": 229.97,
            "status": "shipped",
            "date": "2025-02-01",
        },
        "ORD-9012": {
            "customer": "Carol Davis",
            "items": [{"product": "UltraPhone X", "quantity": 1, "price": 999.99}],
            "total": 999.99,
            "status": "processing",
            "date": "2025-02-10",
        },
    },
}
