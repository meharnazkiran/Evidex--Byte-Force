/**
 * EVIDEX COSMIC TRANSIT ENGINE INTERACTION CONTROLLER
 * Orchestrates the 3D cinematic movement of forensic evidence across agency nodes.
 */
class WormholeTransitController {
    constructor() {
        this.btn = document.getElementById('trigger-handoff-sequence-btn');
        this.projectile = document.getElementById('wormhole-projectile');
        this.mesh = document.getElementById('warp-matrix-mesh');
        this.workspace = document.body;
        
        this.currentStep = 0; // Tracks cycle states: 0: Police->Lab, 1: Lab->Court
        this.initEvents();
    }

    initEvents() {
        if (this.btn) {
            this.btn.addEventListener('click', () => this.executeWormholeTravel());
        }
    }

    executeWormholeTravel() {
        const nodes = document.querySelectorAll('.node-constellation');
        if (nodes.length < 3) return;

        const gyroVault = document.getElementById('gyro-vault-container');

        // Determine current spatial origin and destination nodes based on lifecycle phase
        let sourceNode, targetNode, targetKey;
        if (this.currentStep === 0) {
            sourceNode = nodes[0]; // TN Police
            targetNode = nodes[1]; // Forensic Lab
            targetKey = "lab";
            this.currentStep = 1;
        } else {
            sourceNode = nodes[1]; // Forensic Lab
            targetNode = nodes[2]; // Judicial Court
            targetKey = "court";
            this.currentStep = 0; // Reset loop sequence
        }

        const sourceRect = sourceNode.getBoundingClientRect();
        const targetRect = targetNode.getBoundingClientRect();

        // 1. COMPUTE SECURE COORDINATE LOCATIONS FOR FX PATHWAYS
        const sourceX = sourceRect.left + (sourceRect.width / 2);
        const sourceY = sourceRect.top + (sourceRect.height / 2);
        const targetX = targetRect.left + (targetRect.width / 2);
        const targetY = targetRect.top + (targetRect.height / 2);

        // Map computed coordinates to CSS custom engine parameters (viewport fixed position offsets)
        this.projectile.style.setProperty('--source-x', `${sourceX}px`);
        this.projectile.style.setProperty('--source-y', `${sourceY}px`);
        this.projectile.style.setProperty('--target-x', `${targetX}px`);
        this.projectile.style.setProperty('--target-y', `${targetY}px`);

        // 2. TRIGGER PROPULSION PHASE (ACCELERATE SYSTEMS)
        this.mesh.classList.add('accelerating');
        sourceNode.classList.remove('active');
        
        // Align gyroscope rings parallel to Z-axis
        if (gyroVault) {
            gyroVault.classList.remove('processing');
            gyroVault.classList.add('aligning', 'aligned');
        }

        // Reset projectile state flags
        this.projectile.classList.remove('active');
        void this.projectile.offsetWidth; // Force hardware frame recalculation reflow
        this.projectile.classList.add('active');

        // 3. EN ROUTE: MID-WAY INTERLOCK SEQUENCES
        setTimeout(() => {
            // Overclock destination platform spin dynamics to indicate incoming ledger sync
            targetNode.classList.add('receiving');
            
            // Switch gyroscope from aligned barrel mode to hyper-speed block processing spins
            if (gyroVault) {
                gyroVault.classList.remove('aligned');
                gyroVault.classList.add('processing');
            }
        }, 600);

        // 4. DESTINATION ARRIVAL IMPACT (ANCHOR PHASE)
        setTimeout(() => {
            this.mesh.classList.remove('accelerating');
            targetNode.classList.remove('receiving');
            
            // Reset gyroscope back to standard zero-gravity multi-axis drift orbits
            if (gyroVault) {
                gyroVault.classList.remove('aligning', 'processing');
            }
            
            // Align active node layout classes and vertical emission pillars using app.js
            if (typeof window.setActiveNode === 'function') {
                window.setActiveNode(targetKey);
            } else {
                targetNode.classList.add('active');
            }

            // Trigger structural camera impact shake to create high visual impact for judges
            this.workspace.classList.add('screen-shake-active');
            
            setTimeout(() => {
                this.workspace.classList.remove('screen-shake-active');
            }, 400);

        }, 1400); // Sequence duration maps perfectly to the CSS animation timer
    }
}

// Instantiate the engine on runtime configuration load
document.addEventListener('DOMContentLoaded', () => {
    window.evidexWormhole = new WormholeTransitController();
});
