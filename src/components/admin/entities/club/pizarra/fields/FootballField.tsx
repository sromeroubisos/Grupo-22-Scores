export function FootballField() {
    return (
        <g>
            <rect x="50" y="50" width="600" height="900" fill="#1a472a" stroke="#fff" strokeWidth="2" rx="4" />
            <line x1="50" y1="500" x2="650" y2="500" stroke="#fff" strokeWidth="2.5" />
            <circle cx="350" cy="500" r="70" fill="none" stroke="#fff" strokeWidth="2" />
            <circle cx="350" cy="500" r="4" fill="#fff" />
            <rect x="230" y="50" width="240" height="60" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="280" y="50" width="140" height="20" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="230" y="890" width="240" height="60" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="280" y="930" width="140" height="20" fill="none" stroke="#fff" strokeWidth="2" />
            <circle cx="350" cy="140" r="4" fill="#fff" />
            <circle cx="350" cy="860" r="4" fill="#fff" />
            <path d="M 270 140 A 80 80 0 0 0 430 140" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 270 860 A 80 80 0 0 1 430 860" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 50 90 A 40 40 0 0 1 90 50" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 610 50 A 40 40 0 0 1 650 90" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 50 910 A 40 40 0 0 0 90 950" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M 610 950 A 40 40 0 0 0 650 910" fill="none" stroke="#fff" strokeWidth="2" />
            <rect x="300" y="35" width="100" height="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
            <rect x="300" y="950" width="100" height="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
        </g>
    );
}
