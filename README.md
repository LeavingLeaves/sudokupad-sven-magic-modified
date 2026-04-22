# SudokuPad Sven Magic Modified
Userscript to add a button that does basic deduction in SudokuPad (Pressing Q also works)

The "[Naked Candidates](https://www.sudokuwiki.org/Naked_Candidates)" and "[Hidden Candidates](https://www.sudokuwiki.org/Hidden_Candidates)" strategies are also implemented.

The basic deduction to some common sudoku variant clues are also implemented. They includes:
- Killer Cage
- Kropki Dot
- XV
- (Slow) Thermometer
- German Whisper
- Dutch Whisper
- Renban Line
- Parity Line
- Quadruples
- Global Entropy
- Dutch Flat Mates
Notice that there isn't a consistent way to recognize the variant clues, and now it's detected heavily based on the common appearance of those clues (i.e. German Whisper is commonly green line) and description in title and rule, therefore it's possible to not accurately recognize the clue, so it's turned off by default. Press K to toggle the deduction of variant rules, and press L to toggle the deduction of variant line rules (since they are more likely to go wrong).


## Installation
- Install browser extension for running user scripts: GreaseMonkey for Firefox, TamperMonkey for Google Chrome and family
- Install the script by going to the following link: https://github.com/LeavingLeaves/sudokupad-sven-magic-modified/raw/main/sudokupad-sven-magic-modified.js

## Contributors
- TheBearBoi:
  - Fix spoilering hidden givens in FoW puzzles.
- Leaving Leaves:
  - Add the Q hotkey.
  - Implement the two strategies above.
  - Implement the variant clues above.
