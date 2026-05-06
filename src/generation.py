import google.generativeai as genai
from .config import settings

class Generator:
    def __init__(self):
        genai.configure(api_key=settings.google_api_key)
        self.model = genai.GenerativeModel(settings.llm_model)

    def generate_answer(self, query: str, contexts: list, mode: str = "strict"):
        """
        Generates an answer based on the provided context chunks and grounding mode.
        - strict: Only uses provided context. Refuses if answer is not found.
        - hybrid: Uses both context and internal knowledge.
        """
        
        # 1. Check for small talk first
        if self._is_small_talk(query):
            return self._handle_small_talk(query)

        # 2. Handle empty context for strict mode
        if not contexts and mode == "strict":
            return "I'm sorry, but I don't have this information in your uploaded sources. (Strict Source-First Mode Active)"

        # 3. Prepare the context string
        context_text = "\n\n".join([f"Source: {ctx['filename']} (Index {ctx['chunk_index']}):\n{ctx['text']}" for ctx in contexts])
        
        if mode == "strict":
            system_instruction = (
                "You are a Strict Source-First Assistant. Your knowledge is strictly limited to the provided context. "
                "1. If the answer is not in the context, say: 'I don't have this information in your uploaded sources.' "
                "2. DO NOT use your own training data to answer factual questions. "
                "3. Always cite sources using [Filename]."
            )
        else:
            system_instruction = (
                "You are a Hybrid AI Assistant. Use the provided context as your primary source, but you are allowed to "
                "supplement with your general knowledge (Break-out mode). "
                "Always cite sources using [Filename] if the information came from them."
            )

        prompt = f"""
        {system_instruction}
        
        USER QUESTION: {query}
        
        CONTEXT SOURCES:
        {context_text if context_text else "No specific documents found."}
        
        FINAL ANSWER:
        """
        
        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Error generating answer: {str(e)}"

    def _is_small_talk(self, query: str) -> bool:
        """Robust check for small talk/greetings."""
        small_talk_keywords = {
            "hello", "hi", "hey", "how are you", "who are you", 
            "what can you do", "greetings", "good morning", 
            "good afternoon", "good evening", "thanks", "thank you"
        }
        query_clean = "".join(c for c in query.lower() if c.isalnum() or c.isspace()).strip()
        words = query_clean.split()
        
        # Small talk is usually short or contains specific keywords
        if not words: return False
        if len(words) <= 3 and any(w in small_talk_keywords for w in words):
            return True
        return words[0] in small_talk_keywords and len(words) < 8

    def _handle_small_talk(self, query: str) -> str:
        """Handles conversational queries without context."""
        prompt = (
            f"The user is engaging in small talk: '{query}'. "
            "Respond politely as a Source-First Assistant. "
            "Keep it brief and friendly."
        )
        try:
            response = self.model.generate_content(prompt)
            return response.text
        except:
            return "Hello! I am your Source-First Assistant. How can I help you with your documents today?"

generator = Generator()
