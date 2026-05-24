# Theme Crossword Generator

Generate printable crossword puzzle books in any theme — type a keyword
(`animals`, `food`, `vehicles`, `space`…), get a book of 1–500 puzzles where
every page is a different on-theme crossword.

Themes share the same 165-keyword dictionary as the [word-search generator](https://jayne-07.github.io/wordsearch-generator/)
and [maze book generator](https://jayne-07.github.io/maze-generator/).
In-browser PDF/PNG/ZIP export. Pages sized for 5×8″, 6×9″, or A4 trim.
Answer-key pages at the back of the book.

**Live site:** https://jayne-07.github.io/crossword-generator/

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173/
npm run build    # production bundle in dist/
npm run preview  # preview the production build
```

## Defaults

- 15×15 crossword grid
- Target 12 words per puzzle (actual placed varies — the placer skips words that don't fit)
- Clues are templated: `"<Theme> — starts with <letter>, <N> letters"`
