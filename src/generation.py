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
        - hybrid: Uses both context and internal knowledge (including web search).
        """
        
        # 1. Check for small talk first
        if self._is_small_talk(query):
            return {"answer": self._handle_small_talk(query), "web_sources": []}

        # 2. Handle empty context for strict mode
        if not contexts and mode == "strict":
            return {"answer": "I'm sorry, but I don't have this information in your uploaded sources. (Strict Source-First Mode Active)", "web_sources": []}

        # 3. Prepare the context string with explicit numbering
        context_text = "\n\n".join([f"Source [{i+1}]: {ctx['filename']} (Index {ctx['chunk_index']}):\n{ctx['text']}" for i, ctx in enumerate(contexts)])
        
        if mode == "strict":
            system_instruction = (
                "You are a Strict Source-First Assistant. Your knowledge is strictly limited to the provided context. "
                "1. If the answer is not in the context, say: 'I don't have this information in your uploaded sources.' "
                "2. DO NOT use your own training data to answer factual questions. "
                "3. Always cite every claim using the numeric source label like [1], [2] at the end of the sentence."
            )
            model_to_use = self.model
        else:
            system_instruction = (
                "You are a Hybrid AI Assistant. Use the provided context as your primary source, but you are allowed to "
                "supplement with your general knowledge and real-time web search. "
                "Always cite sources using the numeric label like [1], [2] if the information came from the provided context. "
                "For information found on the web, ensure you include citations which will be processed by the system."
            )
            # Enable Google Search Grounding for Hybrid mode
            model_to_use = genai.GenerativeModel(
                settings.llm_model,
                tools=[{'google_search_retrieval': {}}]
            )

        prompt = f"""
        {system_instruction}
        
        CONTEXT SOURCES (USER DOCUMENTS):
        {context_text if context_text else "No specific documents found."}
        
        USER QUESTION: {query}
        
        FINAL ANSWER:
        """
        
        try:
            response = model_to_use.generate_content(prompt)
            answer_text = response.text
            
            # Extract web sources from grounding metadata if available
            web_sources = []
            local_count = len(contexts)
            
            if hasattr(response, 'candidates') and response.candidates:
                metadata = getattr(response.candidates[0], 'grounding_metadata', None)
                if metadata and hasattr(metadata, 'grounding_chunks'):
                    # 1. Map chunks to our source format
                    for i, chunk in enumerate(metadata.grounding_chunks):
                        if hasattr(chunk, 'web') and chunk.web:
                            web_sources.append({
                                "is_web": True,
                                "url": chunk.web.uri,
                                "site_name": chunk.web.title,
                                "text": "Information retrieved from the live web via Google Search.",
                                "score": 1.0,
                                "filename": chunk.web.title,
                                "chunk_index": i
                            })
                    
                    # 2. Inject citations into the text for web results
                    if hasattr(metadata, 'grounding_supports') and metadata.grounding_supports:
                        # Sort supports by offset to avoid shifting issues while inserting
                        supports = sorted(metadata.grounding_supports, key=lambda s: s.segment.end_index, reverse=True)
                        
                        for support in supports:
                            # For each web chunk index this segment is grounded in
                            for idx in getattr(support, 'grounding_chunk_indices', []):
                                if idx < len(web_sources):
                                    citation_num = local_count + idx + 1
                                    citation_tag = f" [{citation_num}]"
                                    # Insert the citation tag at the end of the segment if not already there
                                    insert_pos = support.segment.end_index
                                    # Ensure we don't double cite if the LLM somehow already added it
                                    if citation_tag not in answer_text[insert_pos-10:insert_pos+10]:
                                        answer_text = answer_text[:insert_pos] + citation_tag + answer_text[insert_pos:]
            
            return {
                "answer": answer_text,
                "web_sources": web_sources
            }

        except Exception as e:
            return {"answer": f"Error generating answer: {str(e)}", "web_sources": []}



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
