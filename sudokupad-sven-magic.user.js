// ==UserScript==
// @name         SudokuPad Sven Magic
// @namespace    http://tampermonkey.net/
// @version      0.10
// @description  Add a button that resolves all singles in SudokuPad
// @author       Chameleon (modified by Leaving Leaves)
// @updateURL    https://github.com/LeavingLeaves/sudokupad-sven-magic/raw/main/sudokupad-sven-magic.user.js
// @match        https://crackingthecryptic.com/*
// @match        https://*.crackingthecryptic.com/*
// @match        https://sudokupad.app/*
// @match        https://*.sudokupad.app/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=app.crackingthecryptic.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

window.addEventListener('DOMContentLoaded', () => {
    let initialized = false;
    const init = () => {
        if (initialized) {
            return;
        }

        const animationSpeed = 500;
        const { app } = Framework;
        const sven = document.getElementById('svenpeek');
        const styles = getComputedStyle(sven);


        const deselect = () => app.act({ type: 'deselect' });
        const select = (cells) => {
            deselect();
            if (cells.length) {
                app.act({ type: 'select', arg: cells });
            }
        };

        let isInTransaction = false;
        const transaction = (callback) => {
            if (isInTransaction) {
                return callback();
            }

            isInTransaction = true;
            const prevSelectedCells = [...app.puzzle.selectedCells];
            app.act({ type: 'groupstart' });

            try {
                return callback();
            } finally {
                isInTransaction = false;
                select(prevSelectedCells);
                app.act({ type: 'groupend' });
            }
        };

        const getCellValue = (cell) => {
            // "hideclue" flag means that the given digit is not currently visible because of FoW - we should ignore such a given
            if (cell.given && !cell.hideclue) {
                return cell.given;
            }

            return cell.value ?? undefined;
        };

        const getCellCandidates = (cell) => {
            // filled value should override the candidates
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

        const acceptSingles = () => transaction(() => {
            let changed = false;

            for (const cell of app.grid.getCellList()) {
                if (!getCellValue(cell) && cell.candidates && cell.candidates.length === 1) {
                    select([cell]);
                    app.act({ type: 'value', arg: cell.candidates[0] });
                    changed = true;
                }
            }

            return changed;
        });

        const markAll = () => transaction(() => {
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

            cleanUp(isUsingSelectedCells ? selectedCells : cells);
        });

        const doMagic = () => transaction(() => {
            for (let i = 0; i < 50; i++) {
                const cleaned = cleanUp();
                const accepted = acceptSingles();
                let changed = false;

                app.currentPuzzle.cages.forEach(cage => {
                    // if (cage.type !== 'rowcol' && cage.style !== 'box') { return; }
                    if (cage.unique !== true) { return; }
                    const cells = cage.parsedCells;

                    // Naked Candidates & Hidden Candidates
                    const combi = (clist, l = -1) => {
                        let vset = new Set(clist.map(c => getCellCandidates(c)).flat());
                        if (vset.size > 0 && vset.size === clist.length) {
                            cells.forEach(c => {
                                if (clist.includes(c)) { return; }
                                Array.from(vset).forEach(v => {
                                    if (!getCellCandidates(c).includes(v)) { return; }
                                    select([c]);
                                    app.act({ type: "candidates", arg: v });
                                    changed = true;
                                });
                            });
                            return;
                        }
                        for (let i = l + 1; i < cells.length; i++) {
                            if (getCellCandidates(cells[i]).length === 0) { continue; }
                            combi([...clist, cells[i]], i);
                        }
                    };
                    combi([]);

                    // Intersection Removal
                    const digits = [...new Set(cells.flatMap(cell => {
                        const value = getCellValue(cell);
                        return value !== undefined ? [value] : cell.candidates;
                    }).filter(Boolean))];
                    if (cells.every(c => c.candidates.length > 0 || getCellValue(c) !== undefined) && digits.length === cells.length) {
                        app.currentPuzzle.cages.forEach(cage2 => {
                            if (cage2.unique !== true || cage === cage2) { return; }
                            const cells2 = cage2.parsedCells;
                            const cellsIntersection = cells.filter(c => cells2.includes(c));
                            if (cellsIntersection.length <= 1) { return; }
                            digits.forEach(v => {
                                if (cells.some(c => !cellsIntersection.includes(c) && getCellCandidates(c).includes(v))) { return; }
                                cells2.forEach(c => {
                                    if (getCellValue(c) !== undefined || cellsIntersection.includes(c)) { return; }
                                    if (!getCellCandidates(c).includes(v)) { return; }
                                    select([c]);
                                    app.act({ type: "candidates", arg: v });
                                    changed = true;
                                });
                            });
                        });
                    }
                });

                if (!cleaned && !accepted && !changed) {
                    break;
                }
            }
        });

        window.addEventListener("keypress", (event) => {
            if (event.key === 'q' || event.key === 'Q' || event.key === '`') { doMagic(); }
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
});
