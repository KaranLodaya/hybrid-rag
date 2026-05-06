import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    print("Error: GOOGLE_API_KEY not found in .env")
else:
    genai.configure(api_key=api_key)
    try:
        print("All Available models:")
        for m in genai.list_models():
            print(f"- {m.name} (Methods: {m.supported_generation_methods})")
    except Exception as e:
        print(f"Error listing models: {e}")
