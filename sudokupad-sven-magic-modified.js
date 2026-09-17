// ==UserScript==
// @name         SudokuPad Sven Magic Modified
// @namespace    http://tampermonkey.net/
// @version      26.4.22
// @description  Add a button that does basic deduction in SudokuPad
// @author       Chameleon (modified by Leaving Leaves)
// @updateURL    https://github.com/LeavingLeaves/sudokupad-sven-magic/raw/main/sudokupad-sven-magic.user.js
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=app.crackingthecryptic.com
// @grant        none
// @run-at       document-start
// @license      MIT license
// ==/UserScript==

let VARIANT = false;
let VARIANT_LINE = true;

let bitCount = new Map();
function getBitCount(v) {
    if (bitCount.get(v) === undefined) {
        let cnt = 0;
        while (v > 0) {
            v = (v & (v - 1));
            cnt++;
        }
        bitCount.set(v, cnt);
    }
    return bitCount.get(v);
}

function main() {
    let initialized = false;
    const init = () => {
        if (initialized) {
            return;
        }

        const animationSpeed = 500;
        const { app } = Framework;
        const sven = document.getElementById('svenpeek');
        const styles = getComputedStyle(sven);
        const sleep = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

        const deselect = () => app.act({ type: 'deselect' });
        const select = (cells) => {
            deselect();
            if (cells.length) {
                app.act({ type: 'select', arg: cells });
            }
        };

        let isInTransaction = false;
        const transaction = async (callback) => {
            if (isInTransaction) {
                return callback();
            }

            isInTransaction = true;
            const prevSelectedCells = [...app.puzzle.selectedCells];
            app.act({ type: 'groupstart' });

            try {
                return await callback();
            } finally {
                isInTransaction = false;
                select(prevSelectedCells);
                app.act({ type: 'groupend' });
            }
        };

        const getCellValue = (cell) => {
            // "hideclue" flag means that the given digit is not currently visible because of FoW - we should ignore such a given
            if (cell === undefined) { return undefined; }
            if (cell.given && !cell.hideclue) {
                return cell.given;
            }

            return cell.value ?? undefined;
        };

        const getCellCandidates = (cell) => {
            // filled value should override the candidates
            if (cell === undefined) {
                return [];
            }
            if (getCellValue(cell) !== undefined) {
                return [getCellValue(cell)];
            }
            return cell.candidates;
        };

        const cleanUp = (applyToCells = app.grid.getCellList()) => transaction(() => {
            const conflicts = app.puzzle.check(['pencilmarks']);

            for (const { prop, cells, val } of conflicts) {
                const type = prop === 'centre' ? 'candidates' : 'pencilmarks';
                select(cells.filter(cell => applyToCells.includes(cell) && cell[type].includes(val)));
                app.act({ type, arg: val });
            }

            return conflicts.length > 0;
        });

        const acceptSingles = () => transaction(async () => {
            let changed = false;

            for (const cell of app.grid.getCellList()) {
                if (!getCellValue(cell) && cell.candidates && cell.candidates.length === 1) {
                    select([cell]);
                    app.act({ type: 'value', arg: cell.candidates[0] });
                    changed = true;
                    await sleep();
                }
            }

            return changed;
        });

        const markAll = () => transaction(async () => {
            const cells = app.grid.getCellList();
            const selectedCells = [...app.puzzle.selectedCells];
            const emptyCell = cells.find(cell => !getCellValue(cell));
            const digits = [
                ...new Set(cells.flatMap(cell => {
                    const value = getCellValue(cell);
                    return value !== undefined ? [value] : [...cell.candidates, ...cell.pencilmarks];
                })
                    .filter(Boolean))
            ];

            const isFillableCell = cell => !getCellValue(cell) && !cell.candidates.length && !cell.pen.some(p => p[0] === 't');
            let fillableCells = selectedCells.filter(isFillableCell);
            const isUsingSelectedCells = fillableCells.length !== 0
                // there are selected cells with conflicts - the Mark button could fix them
                || app.puzzle.check(['pencilmarks']).some(({ cells }) => cells.some(cell => selectedCells.includes(cell)))
                // user chose to mark only the selected cells no matter what in the settings
                || (Framework.getSetting(selectedOnlySetting.name) && selectedCells.length !== 0);
            if (!isUsingSelectedCells) {
                fillableCells = cells.filter(isFillableCell);
            }
            select(fillableCells);
            for (const digit of digits) {
                app.act({ type: 'candidates', arg: digit });
            }
            await sleep();

            cleanUp(isUsingSelectedCells ? selectedCells : cells);
        });

        const doMagic = () => transaction(async () => {
            for (let i = 0; i < 50; i++) {
                const cleaned = cleanUp();
                const accepted = acceptSingles();
                let changed = false;

                function canPlace(cell, value) {
                    if (cell === undefined) { return false; }
                    if ((getCellValue(cell) ?? value) !== value) { return false; }
                    if (cell.candidates.length > 0 && !getCellCandidates(cell).includes(value)) { return false; }
                    return true;
                }

                async function fillValue(cell, value) {
                    if (cell === undefined) { return; }
                    if (typeof (value) === "number") { value = value.toString(); }
                    if (getCellValue(cell)) { return; }
                    select([cell]);
                    app.act({ type: 'value', arg: value });
                    changed = true;
                    await sleep();
                }

                async function removeCandidates(cells, candidates) {
                    if (!Array.isArray(cells)) { cells = [cells]; }
                    if (!Array.isArray(candidates)) { candidates = [candidates]; }
                    candidates = candidates.map(v => typeof (v) === "number" ? v.toString() : v);
                    for (const c of cells) {
                        if (c === undefined || getCellValue(c) !== undefined) { continue; }
                        for (const v of candidates) {
                            if (!c.candidates.includes(v)) { continue; }
                            select([c]);
                            app.act({ type: "candidates", arg: v });
                            changed = true;
                            await sleep();
                        }
                        if (getCellCandidates(c).length === 1) {
                            await fillValue(c, c.candidates[0]);
                        }
                    }
                };

                for (const cage of app.currentPuzzle.cages) {
                    // if (cage.type !== 'rowcol' && cage.style !== 'box') { continue; }
                    if (cage.unique !== true) { continue; }
                    const cells = cage.parsedCells.filter(c => getCellValue(c) === undefined);
                    const candis = cells.map(c => getCellCandidates(c));
                    const candiset = Array.from(new Set(candis.flat()));
                    const candimask = candis.map(l => l.map(c => (1 << candiset.indexOf(c))).reduce((a, b) => (a | b), 0));

                    // Naked Candidates & Hidden Candidates
                    const combi = async (cilist, l = -1) => {
                        const mask = cilist.reduce((a, i) => (a | (candimask[i])), 0);
                        if (mask > 0 && getBitCount(mask) === cilist.length) {
                            await removeCandidates(cells.filter((c, i) => !cilist.includes(i)), Array.from(new Set(cilist.map(ci => candis[ci]).flat())));
                            return;
                        }
                        for (let i = l + 1; i < cells.length; i++) {
                            if (candimask[i] === 0) { continue; }
                            cilist.push(i);
                            combi(cilist, i);
                            cilist.pop();
                        }
                    };
                    combi([]);

                    // Intersection Removal
                    const digits = [...new Set(cells.flatMap(cell => {
                        const value = getCellValue(cell);
                        return value !== undefined ? [value] : cell.candidates;
                    }).filter(Boolean))];
                    if (cells.every(c => c.candidates.length > 0 || getCellValue(c) !== undefined) && digits.length === cells.length) {
                        for (const cage2 of app.currentPuzzle.cages) {
                            if (cage2.unique !== true || cage === cage2) { continue; }
                            const cells2 = cage2.parsedCells;
                            const cellsIntersection = cells.filter(c => cells2.includes(c));
                            if (cellsIntersection.length <= 1) { continue; }
                            for (const v of digits) {
                                if (cells.some(c => !cellsIntersection.includes(c) && getCellCandidates(c).includes(v))) { continue; }
                                await removeCandidates(cells2.filter(c => !cellsIntersection.includes(c)), v);
                            }
                        }
                    }
                }

                const rules = (app.currentPuzzle.title + '\n' + app.currentPuzzle.rules).normalize('NFKD');

                // Variant Rule
                if (VARIANT) {
                    const elements = [...app.sourcePuzzle.overlays ?? [], ...app.sourcePuzzle.underlays ?? []];
                    // Killer Cage
                    for (const cage of app.currentPuzzle.cages) {
                        if (cage.style !== "killer" || cage.value === undefined) { continue; }
                        if (cage.parsedCells.some(c => getCellCandidates(c).length === 0 || c.hideclue)) { continue; }
                        if (cage.parsedCells.length > 5) { continue; }
                        const sum = parseInt(cage.value);
                        const arr = cage.parsedCells.map(c => getCellCandidates(c));
                        const getCombinations = (arrays, n) =>
                            arrays.reduce((acc, cur) => acc.flatMap(c => cur.map(v => [...c, v]))
                                .filter(l => l.reduce((s, v) => s + parseInt(v), 0) <= n && (!cage.unique || new Set(l).size === l.length)), [[]])
                                .filter(comb => comb.reduce((s, v) => s + parseInt(v), 0) === n);
                        const combs = getCombinations(arr, sum);
                        for (const [i, c] of cage.parsedCells.entries()) {
                            for (const v of getCellCandidates(c)) {
                                if (!combs.some(comb => comb[i] === v)) {
                                    await removeCandidates(c, v);
                                }
                            }
                        }
                    }

                    async function DominoClue(cell1, cell2, cond, dir = false) {
                        if (cell1.hideclue && cell2.hideclue) { return; }
                        const cand1 = getCellCandidates(cell1);
                        const cand2 = getCellCandidates(cell2);
                        const f = (a, b) => cond(parseInt(a), parseInt(b));
                        if (cand1.length === 0 || cand2.length === 0) { return; }
                        for (const v1 of cand1) {
                            if (!cand2.some(v2 => f(v1, v2) || !dir && f(v2, v1))) {
                                await removeCandidates(cell1, v1);
                            }
                        }
                        for (const v2 of cand2) {
                            if (!cand1.some(v1 => f(v1, v2) || !dir && f(v2, v1))) {
                                await removeCandidates(cell2, v2);
                            }
                        }
                    }

                    // Dot Clue
                    for (const obj of elements) {
                        if (!obj.center.some(v => v % 1 === 0) || !obj.center.some(v => v % 1 === .5)) { continue; }
                        const cell1 = app.puzzle.cells.find(cell => cell.row === Math.floor(obj.center[0] - .5) && cell.col === Math.floor(obj.center[1] - .5));
                        const cell2 = app.puzzle.cells.find(cell => cell.row === Math.floor(obj.center[0]) && cell.col === Math.floor(obj.center[1]));
                        // V
                        if (obj.text === "V") {
                            DominoClue(cell1, cell2, (a, b) => a + b === 5);
                        }
                        // X
                        if (obj.text === "X") {
                            await removeCandidates([cell1, cell2], 5);
                            DominoClue(cell1, cell2, (a, b) => a + b === 10);
                        }
                        // Black Kropki Dot
                        if (/kropki|black/i.test(rules) && (obj.text ?? "") === "" && obj.backgroundColor === "#000000") {
                            DominoClue(cell1, cell2, (a, b) => a * 2 === b);
                        }
                        // White Kropki Dot
                        if (/kropki|white/i.test(rules) && (obj.text ?? "") === "" && obj.backgroundColor === "#FFFFFF") {
                            DominoClue(cell1, cell2, (a, b) => a + 1 === b);
                        }
                    }

                    // Line Clue
                    for (const line of (app.sourcePuzzle.lines ?? [])) {
                        if (!VARIANT_LINE) { break; }
                        const lcells = [];
                        let x_lst = undefined, y_lst = undefined;
                        if (line.wayPoints === undefined || line.wayPoints.some(([x, y]) => x % 1 !== .5 || y % 1 !== .5)) { continue; }
                        for (const [x, y] of line.wayPoints) {
                            if (x_lst === undefined) {
                                [x_lst, y_lst] = [x, y];
                                lcells.push(app.puzzle.cells.find(cell => cell.row === x_lst - .5 && cell.col === y_lst - .5));
                            }
                            while (x_lst !== x || y_lst !== y) {
                                x_lst += (Math.sign(x - x_lst));
                                y_lst += (Math.sign(y - y_lst));
                                lcells.push(app.puzzle.cells.find(cell => cell.row === x_lst - .5 && cell.col === y_lst - .5));
                            }
                        }
                        if (lcells.some(c => c === undefined)) { continue; }
                        // Thermometer
                        if (elements.some(obj => obj.backgroundColor === line.color && obj.rounded &&
                            obj.center[0] - .5 === lcells[lcells.length - 1].row && obj.center[1] - .5 === lcells[lcells.length - 1].col)) {
                            lcells.reverse();
                        }
                        if (/thermo/i.test(rules) && elements.some(obj => obj.backgroundColor === line.color && obj.rounded &&
                            obj.center[0] - .5 === lcells[0].row && obj.center[1] - .5 === lcells[0].col) && !lcells.some(c => c === undefined || c.hideclue)) {
                            for (const [i, cell1] of lcells.entries()) {
                                if (i + 1 === lcells.length) { break; }
                                const cell2 = lcells[i + 1];
                                if (/\bslow\b/i.test(rules) && !app.currentPuzzle.cages.some(cage => cage.unique && cage.parsedCells.includes(cell1) && cage.parsedCells.includes(cell2))) {
                                    DominoClue(cell1, cell2, (a, b) => a <= b, true);
                                } else {
                                    DominoClue(cell1, cell2, (a, b) => a < b, true);
                                }
                            }
                        }
                        const rgbToHsv = (r, g, b) => {
                            r /= 255, g /= 255, b /= 255;
                            const max = Math.max(r, g, b), min = Math.min(r, g, b);
                            const d = max - min;
                            const h = d === 0 ? 0 : max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
                            const s = max === 0 ? 0 : d / max;
                            return [(h * 60 + 360) % 360, s, max];
                        };
                        const isColor = (c1, c2, tol = 15) => {
                            c1 = c1.replace(/^#/, '').replace(/^0x/, '').toUpperCase();
                            c2 = c2.replace(/^#/, '').replace(/^0x/, '').toUpperCase();
                            if (c1.length < 6) c1 = c1.split('').map(c => c + c).join('');
                            if (c2.length < 6) c2 = c2.split('').map(c => c + c).join('');
                            if (tol === 0) { return c1.slice(0, 6) === c2.slice(0, 6); }
                            const toRgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
                            const [r1, g1, b1] = toRgb(c1);
                            const [r2, g2, b2] = toRgb(c2);
                            const [h1, s1, v1] = rgbToHsv(r1, g1, b1);
                            const [h2, s2, v2] = rgbToHsv(r2, g2, b2);
                            return Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2)) <= tol && s1 > .1 && s2 > .1;
                        };
                        for (const [i, cell1] of lcells.entries()) {
                            if (i + 1 === lcells.length) { break; }
                            const cell2 = lcells[i + 1];
                            const color = line.color;
                            // German Whisper
                            if (/german/i.test(rules) && isColor(color, "#67f067") && app.sourcePuzzle.cells.length === 9) {
                                DominoClue(cell1, cell2, (a, b) => Math.abs(a - b) >= 5);
                            }
                            // Dutch Whisper
                            if (/dutch/i.test(rules) && isColor(color, "#ffa600") && app.sourcePuzzle.cells.length === 9) {
                                DominoClue(cell1, cell2, (a, b) => Math.abs(a - b) >= 4);
                            }
                            // Renban
                            if (/renban/i.test(rules) && isColor(color, "#f067f0") && !lcells.some(c => c.hideclue)) {
                                let len = new Set(lcells).size;
                                let vlist = lcells.map(c => getCellValue(c)).filter(v => v !== undefined);
                                if (!lcells.some(c => getCellCandidates(c).length === 0)) {
                                    vlist.push(..."123456789".split('').filter(v1 => lcells.some(c => !getCellCandidates(c).some(v2 => Math.abs(v1 - v2) < len))));
                                }
                                await removeCandidates(lcells, vlist);
                            }
                            // Parity
                            if (/parity/i.test(rules) && isColor(color, "#f66f")) {
                                DominoClue(cell1, cell2, (a, b) => (a + b) % 2 === 1);
                            }
                        }
                    }

                    // Quadruples
                    for (const obj of elements) {
                        if (obj.backgroundColor === "#FFFFFF" && obj.center.every(v => v % 1 === 0)) {
                            if (obj.text === undefined) { continue; }
                            const values = obj.text.split(/\n|\s/);
                            if (values.length === 0) { continue; }
                            const cells = [[0, 0], [0, -1], [-1, 0], [-1, -1]].map(([dr, dc]) => app.puzzle.cells.find(cell => cell.row === obj.center[0] + dr && cell.col === obj.center[1] + dc));
                            if (cells.some(c => getCellCandidates(c).length === 0 || c.hideclue)) { continue; }
                            if (values.length === 4) {
                                await removeCandidates(cells, "123456789".split('').filter(v => !values.includes(v)));
                            }
                            for (const v of values) {
                                let qcells = cells.filter(c => getCellCandidates(c).includes(v));
                                if (qcells.length === 1) {
                                    await fillValue(qcells[0], v);
                                }
                            }
                            for (const cage of app.currentPuzzle.cages) {
                                if (cage.unique !== true) { continue; }
                                if (cells.some(c => !cage.parsedCells.includes(c))) { continue; }
                                const ocells = cage.parsedCells.filter(c => !cells.includes(c));
                                await removeCandidates(ocells, values);
                            }
                        }
                    }

                    // Global Entropy
                    if (/global entropy/i.test(rules)) {
                        for (let i = 1; i < app.sourcePuzzle.cells.length; i++) {
                            for (let j = 1; j < app.sourcePuzzle.cells[0].length; j++) {
                                let scells = [[i - 1, j - 1], [i - 1, j], [i, j - 1], [i, j]].map(([r, c]) => app.puzzle.cells.find(cell => cell.row === r && cell.col === c));
                                if (scells.some(c => getCellCandidates(c).length === 0)) { continue; }
                                for (const ent of ["123", "456", "789"]) {
                                    ent = ent.split('');
                                    let entcells = scells.filter(c => getCellCandidates(c).some(v => ent.includes(v)));
                                    if (entcells.length === 1) {
                                        let cell = entcells[0];
                                        await removeCandidates(cell, getCellCandidates(cell).filter(v => !ent.includes(v)));
                                    }
                                }
                            }
                        }
                    }

                    // Dutch Flat Mates
                    if (/dutch flats?|flat mates?/i.test(rules)) {
                        const cells = app.puzzle.cells;
                        for (const cell of cells) {
                            const { row, col } = cell;
                            const cellN = cells.find(cell => cell.row === row - 1 && cell.col === col);
                            const cellS = cells.find(cell => cell.row === row + 1 && cell.col === col);
                            if (getCellValue(cell) === '5' && !canPlace(cellN, '1')) {
                                await fillValue(cellS, '9');
                            }
                            if (getCellValue(cell) === '5' && !canPlace(cellS, '9')) {
                                await fillValue(cellN, '1');
                            }
                            if (!canPlace(cellN, '1') && !canPlace(cellS, '9')) {
                                await removeCandidates(cell, '5');
                            }
                            if (getCellValue(cell) === '9' || cellS === undefined && !canPlace(cell, '5')) {
                                await removeCandidates(cellN, '1');
                            }
                            if (getCellValue(cell) === '1' || cellN === undefined && !canPlace(cell, '5')) {
                                await removeCandidates(cellS, '9');
                            }
                        }
                    }
                }

                if (!cleaned && !accepted && !changed) {
                    break;
                }
            }
        });

        window.addEventListener("keypress", (event) => {
            if (event.key === 'q' || event.key === 'Q' || event.key === '`') { doMagic(); }
        });
        window.addEventListener("keypress", (event) => {
            if (event.key === 'k' || event.key === 'K') { VARIANT = !VARIANT; console.log(`Variant rules: ${VARIANT}`); }
        });
        window.addEventListener("keypress", (event) => {
            if (event.key === 'l' || event.key === 'L') { VARIANT_LINE = !VARIANT_LINE; console.log(`Variant line rules: ${VARIANT_LINE}`); }
        });

        const createButton = (title, onClick, options = {}) => {
            const sven2 = document.createElement('div');
            for (const key of ['width', 'height', 'background', 'backgroundImage', 'position', 'zIndex']) {
                sven2.style[key] = options[key] = options[key] ?? styles[key];
            }
            sven2.style.bottom = sven2.style.left = sven2.style.right = 0;
            sven2.style.margin = '0px auto 1rem';
            sven2.style.transition = animationSpeed + 'ms ease all';

            const toggle = show => {
                sven2.style.backgroundPosition = 'center ' + (show ? '0px' : options.height);
            }
            toggle(false);

            sven.parentElement.appendChild(sven2);

            Framework.addAuxButton({
                name: title.replace(/ /g, '').toLowerCase(),
                title,
                content: `<div class="icon" style="width: 3.5rem; height: 3.5rem; background: ${options.backgroundImage.replace(/"/g, "'")} no-repeat center center; background-size: cover"></div>${title}`,
                onClick() {
                    toggle(true);
                    setTimeout(() => {
                        setTimeout(() => toggle(false), 1);
                        onClick();
                    }, animationSpeed);
                },
            });
        };

        createButton('Mark it', markAll, {
            width: '174px',
            height: '125px',
            backgroundImage: 'url("https://i.gyazo.com/4080ac270e344efa60f2978db88f6ba6.png")'
        });
        createButton('Sven it', doMagic);

        const selectedOnlySetting = {
            tag: 'toggle',
            group: 'gameplay',
            name: 'markbutton_selected',
            content: 'Apply Mark button only to selected cells',
        };
        Framework.addSetting(selectedOnlySetting);
        initialized = true;
    }

    if (typeof Framework !== "undefined" && Framework.getApp) {
        Framework.getApp().then(init);
    }
    console.log("SudokuPad Sven Magic Enabled.");
}

if (document.readyState === "loading") {
    // Loading hasn't finished yet
    document.addEventListener("DOMContentLoaded", main);
} else {
    // `DOMContentLoaded` has already fired
    main();
}
