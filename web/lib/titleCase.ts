export function titleCasePt(text: string) {
    if (!text) return "";
  
    const lowerWords = [
      "de", "da", "do", "das", "dos",
      "e", "em", "para", "por", "com", "no", "na", "nos", "nas",
    ];
  
    return text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((w, i) => {
        if (i !== 0 && lowerWords.includes(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(" ");
  }
  