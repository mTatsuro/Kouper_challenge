
import os
from dotenv import load_dotenv

load_dotenv()

class LLMNotConfigured(Exception):
    pass

def call_llm(system_prompt: str, user_prompt: str) -> str:
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    if not api_key:
        raise LLMNotConfigured("OPENAI_API_KEY is not set. Put it in backend/.env or export it in your shell.")

    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    try:
        msg = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
        )
        return msg.choices[0].message.content or ""
    except Exception as e:
        raise RuntimeError(f"OpenAI error: {e}")
