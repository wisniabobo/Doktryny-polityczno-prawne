// Rejestr treści. Każdy plik rozdziału wywołuje DPP.add({...}).
// Źródła: HD = K. Chojnicka, H. Olszewski, Historia doktryn politycznych i prawnych, Poznań 2004
//         LX = Leksykon myślicieli politycznych i prawnych, red. E. Kundera, M. Maciejewski, wyd. III, Warszawa 2009
window.DPP = { chapters: [], thinkers: [], add(ch) { this.chapters.push(ch); }, addThinkers(list) { this.thinkers.push(...list); } };
