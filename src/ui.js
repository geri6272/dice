
export class UI {
    constructor(callbacks) {
        this.callbacks = callbacks; // { onRoll: fn, onSelectDice: fn, onHistoryClick: fn }
        this.selectedDiceType = 'd20';
        this.isRolling = false;

        // Cache DOM elements
        this.diceSelector = document.getElementById('dice-selector');
        this.rollBtn = document.getElementById('roll-btn');
        this.historyList = document.getElementById('history-list');
        this.runePanel = document.getElementById('rune-panel');
        this.runeSymbol = document.getElementById('rune-symbol');
        this.runeName = document.getElementById('rune-name');
        this.runeMeaning = document.getElementById('rune-meaning');
        this.canvasContainer = document.getElementById('canvas-container');

        this.init();
    }

    init() {
        // Bind Dice Selection
        this.diceSelector.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                const type = e.target.dataset.type;
                this.selectDice(type);
            }
        });

        // Bind Roll Button
        this.rollBtn.addEventListener('click', () => {
            // Force roll even if currently rolling (interrupt)
            this.callbacks.onRoll(this.selectedDiceType);
            this.rollBtn.blur();
        });
        
        // Canvas Click/Drag to roll (simple click for now)
        this.canvasContainer.addEventListener('mousedown', (e) => {
             if (e.button === 0) { // Left click
                this.callbacks.onRoll(this.selectedDiceType);
             }
        });

        // Initial Selection
        this.selectDice('d20');
    }

    selectDice(type) {
        this.selectedDiceType = type;
        this.setRolling(false);
        
        // Update UI
        const buttons = this.diceSelector.querySelectorAll('button');
        buttons.forEach(btn => {
            if (btn.dataset.type === type) {
                btn.classList.add('active');
                // Apply active style (handled by CSS class)
                btn.style.borderColor = '#00d4aa';
                btn.style.color = '#00d4aa';
            } else {
                btn.classList.remove('active');
                btn.style.borderColor = '#2a2a2a';
                btn.style.color = '#f5f5f5';
            }
        });

        this.callbacks.onSelectDice(type);
        this.hideRunePanel();
    }

    setRolling(rolling) {
        this.isRolling = rolling;
        // Don't disable button to allow re-roll spamming if desired
        // this.rollBtn.disabled = rolling;
        // this.rollBtn.style.opacity = rolling ? '0.5' : '1';
        // this.rollBtn.style.cursor = rolling ? 'not-allowed' : 'pointer';
        
        if (rolling) {
            this.hideRunePanel();
        }
    }

    showRuneResult(result, runeData) {
        // Update Content
        this.runeSymbol.textContent = runeData.symbol;
        this.runeName.textContent = runeData.name;
        this.runeMeaning.textContent = runeData.meaning;

        // Fade In
        this.runePanel.style.opacity = '1';
        this.runePanel.style.pointerEvents = 'auto';

        // Add to history
        this.addToHistory(this.selectedDiceType, result, runeData);
    }

    hideRunePanel() {
        this.runePanel.style.opacity = '0';
        this.runePanel.style.pointerEvents = 'none';
    }

    addToHistory(diceType, result, runeData) {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.style.padding = '12px';
        item.style.borderBottom = '1px solid #2a2a2a';
        item.style.cursor = 'pointer';
        item.style.fontSize = '12px';
        item.style.color = '#888';

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="color: #00d4aa; font-weight: bold;">${diceType.toUpperCase()} ➜ ${result}</span>
                <span>${time}</span>
            </div>
            <div style="color: #f5f5f5;">${runeData.name}</div>
        `;

        item.addEventListener('click', () => {
            this.showRuneResult(result, runeData);
        });

        // Prepend
        this.historyList.insertBefore(item, this.historyList.firstChild);

        // Limit to 20
        if (this.historyList.children.length > 20) {
            this.historyList.removeChild(this.historyList.lastChild);
        }
    }
}
