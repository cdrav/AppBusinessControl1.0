/* =========================================
   BUSINESS CONTROL - THEME TOGGLE
   Funcionalidad para cambiar entre light/dark mode
   ========================================= */

// Theme Toggle Functionality
class ThemeManager {
    constructor() {
        this.init();
    }

    init() {
        // Load saved theme or default to light
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
        
        // Create theme toggle button
        this.createThemeToggle();
    }

    createThemeToggle() {
        const toggleHTML = `
            <button id="theme-toggle" class="theme-toggle focus-ring" 
                    aria-label="Cambiar tema" 
                    title="Cambiar entre modo claro y oscuro">
                <i class="bi bi-sun-fill" id="theme-icon"></i>
            </button>
        `;

        // Add styles for theme toggle
        const styles = `
            .theme-toggle {
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: var(--primary);
                color: white;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.2rem;
                box-shadow: var(--shadow-hover);
                z-index: 1000;
                transition: var(--transition);
            }

            .theme-toggle:hover {
                transform: scale(1.1);
                background: var(--primary-hover);
            }

            .theme-toggle:active {
                transform: scale(0.95);
            }
        `;

        // Add styles to head
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);

        // Add button to body
        const toggleDiv = document.createElement('div');
        toggleDiv.innerHTML = toggleHTML;
        document.body.appendChild(toggleDiv);

        // Add event listener
        document.getElementById('theme-toggle').addEventListener('click', () => {
            this.toggleTheme();
        });
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        this.updateIcon(theme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    updateIcon(theme) {
        const icon = document.getElementById('theme-icon');
        if (icon) {
            icon.className = theme === 'dark' ? 'bi bi-moon-fill' : 'bi bi-sun-fill';
        }
    }
}

// Initialize theme manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ThemeManager();
});
