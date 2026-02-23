You are evaluating whether an agent's answer to a question is correct and helpful.

## Question:
{{QUESTION}}

## Reference Answer:
{{REFERENCE}}

## Agent's Answer:
{{ANSWER}}

Does the agent's answer contain the key information from the reference answer? The agent doesn't need to match word-for-word, but it should convey the same essential guidance. Minor omissions are okay as long as the core answer is correct. Additional correct information beyond the reference is fine and should NOT count against the agent — only penalize genuinely wrong facts (wrong commands, wrong syntax, fabricated features that don't exist). If unsure whether extra info is real, give the agent the benefit of the doubt.

Return ONLY a valid JSON object:

{"passed": true, "reasoning": "Brief explanation covering what the agent gets right"}

or

{"passed": false, "reasoning": "Brief explanation of what's wrong or missing"}

Return ONLY the JSON object, nothing else.
