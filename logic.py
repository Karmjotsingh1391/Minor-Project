from rapidfuzz import fuzz

def load_verses(file_path):
    try:
        with open(file_path, "r", encoding="utf-8-sig") as f:
            text = f.read()
        raw_paragraphs = text.strip().split("\n\n")
        paragraphs = []
        for p in raw_paragraphs:
            lines = [line.strip() for line in p.strip().split("\n") if line.strip()]
            if lines: paragraphs.append(lines)
        return paragraphs
    except Exception as e:
        print(f"Error loading file: {e}")
        return []

class VerseMatcher:
    def __init__(self, paragraphs, threshold=60):
        self.paragraphs = paragraphs
        self.threshold = threshold
        self.last_index = 0  # THE ANCHOR: Remembers the last matched verse index

    def find_next_line(self, spoken_text):
        if not spoken_text.strip(): return []

        # SPEED BOOST: Search 15 paragraphs ahead of the last match first
        # This takes 0.001 seconds compared to 0.5 seconds for a global search.
        start = self.last_index
        end = min(self.last_index + 15, len(self.paragraphs))
        
        for i in range(start, end):
            para = self.paragraphs[i]
            for line in para:
                score = fuzz.token_set_ratio(spoken_text, line)
                if score >= self.threshold:
                    self.last_index = i # Update Anchor
                    return [{"matched_line": line, "paragraph": "\n".join(para), "score": score}]

        # FALLBACK: If not found nearby, search the whole book (Global Search)
        for i, para in enumerate(self.paragraphs):
            for line in para:
                score = fuzz.token_set_ratio(spoken_text, line)
                if score >= self.threshold:
                    self.last_index = i
                    return [{"matched_line": line, "paragraph": "\n".join(para), "score": score}]
        return []