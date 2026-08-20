export function BasketballField() {
    return (
        <g>
            <rect x="50" y="50" width="600" height="600" fill="#c9783c" stroke="#fff" strokeWidth="3" rx="4" />
            <line x1="50" y1="350" x2="650" y2="350" stroke="#fff" strokeWidth="2" />
            <circle cx="350" cy="350" r="60" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="230" y="50" width="240" height="190" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="250" y="50" width="200" height="120" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 230 240 A 120 120 0 0 0 470 240" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="230" y="360" width="240" height="190" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="250" y="430" width="200" height="120" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 230 360 A 120 120 0 0 1 470 360" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 50 130 A 300 300 0 0 1 650 130" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 50 570 A 300 300 0 0 0 650 570" fill="none" stroke="#fff" strokeWidth="2" />
            <circle cx="350" cy="80" r="12" fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <circle cx="350" cy="620" r="12" fill="none" stroke="#e2e8f0" strokeWidth="3" />
        </g>
    );
}
