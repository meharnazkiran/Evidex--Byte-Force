/**
 * EVIDEX — Gravitational Warp Grid (Space-Time Canvas)
 * Renders a 3D-perspective grid that deforms around the cursor, deforms into a swirling
 * wormhole vortex on file uploads, and spawns upward-flowing coordinates data packets.
 */

class GravitationalWarpGrid {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext("2d");
    this.gridSpacing = 55;
    this.gridNodes = [];
    
    // Interaction states
    this.mouse = { x: -1000, y: -1000, radius: 220, strength: 0.5 };
    this.funnel = { x: 0, y: 0, active: false, strength: 0, targetStrength: 0, angleOffset: 0 };
    
    // Drifting data packets
    this.packets = [];
    this.maxPackets = 40;
    this.colors = {
      emerald: "rgba(0, 255, 140, ",
      cyan: "rgba(0, 242, 254, "
    };

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener("resize", () => this.resize());

    // Mouse move tracking
    document.addEventListener("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    // Reset mouse when off screen
    document.addEventListener("mouseleave", () => {
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    });

    // Setup listener on document for file inputs to trigger funnel warp
    document.addEventListener("change", (e) => {
      if (e.target && e.target.type === "file" && e.target.files.length > 0) {
        this.triggerWormholeFunnel();
      }
    });

    // Seed initial coordinates data packets
    for (let i = 0; i < this.maxPackets; i++) {
      this.packets.push(this.createPacket(true));
    }

    this.animate();
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Place funnel center at active light column coordinates
    this.funnel.x = this.width / 2;
    this.funnel.y = this.height * 0.45;
  }

  triggerWormholeFunnel() {
    this.funnel.targetStrength = 1.0;
    this.funnel.active = true;
    
    // Auto-revert funnel warp pull after 4 seconds
    setTimeout(() => {
      this.funnel.targetStrength = 0;
    }, 4500);
  }

  createPacket(randomY = false) {
    return {
      x: Math.random() * this.width,
      y: randomY ? Math.random() * this.height : this.height + 20,
      size: 1.5 + Math.random() * 2,
      speedY: 0.8 + Math.random() * 1.5,
      speedX: -0.2 + Math.random() * 0.4,
      color: Math.random() < 0.65 ? this.colors.emerald : this.colors.cyan,
      alpha: 0.15 + Math.random() * 0.4,
      driftScale: 40 + Math.random() * 60
    };
  }

  // Calculates grid node displacement under mouse gravity and active wormhole funnel
  calculateDisplacement(origX, origY) {
    let x = origX;
    let y = origY;

    // 1. Mouse Gravitational Sink (deforms coordinates inward around cursor)
    const dx = x - this.mouse.x;
    const dy = y - this.mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < this.mouse.radius) {
      const pullFactor = (1 - dist / this.mouse.radius) * this.mouse.strength;
      x -= dx * pullFactor * 0.6;
      y -= dy * pullFactor * 0.6;
    }

    // 2. Wormhole Funnel Vortex (swirls coordinates inward to center event horizon)
    if (this.funnel.strength > 0.01) {
      // Find current horizontal column center dynamically
      const activeX = window.activeNodeX || this.width / 2;
      const targetY = this.height * 0.35;
      
      const cdx = x - activeX;
      const cdy = y - targetY;
      const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
      
      // Pull strength increases closer to funnel center
      const pullFactor = Math.min(1.2, 280 / (cdist + 60)) * this.funnel.strength;
      
      // Pull inward
      x -= cdx * pullFactor * 0.5;
      y -= cdy * pullFactor * 0.5;
      
      // Swirl angle around core (vortex spiral)
      const swirlAngle = 0.08 * pullFactor * this.funnel.strength;
      const cos = Math.cos(swirlAngle);
      const sin = Math.sin(swirlAngle);
      
      const rx = (x - activeX) * cos - (y - targetY) * sin + activeX;
      const ry = (x - activeX) * sin + (y - targetY) * cos + targetY;
      x = rx;
      y = ry;
    }

    return { x, y };
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Smooth transition funnel strength towards target
    this.funnel.strength += (this.funnel.targetStrength - this.funnel.strength) * 0.05;
    if (this.funnel.strength < 0.005) {
      this.funnel.strength = 0;
      this.funnel.active = false;
    }

    const cols = Math.ceil(this.width / this.gridSpacing) + 2;
    const rows = Math.ceil(this.height / this.gridSpacing) + 2;
    const displacedNodes = [];

    // 1. Calculate displaced position for all grid coordinates
    for (let c = -1; c < cols; c++) {
      displacedNodes[c] = [];
      for (let r = -1; r < rows; r++) {
        const origX = c * this.gridSpacing;
        const origY = r * this.gridSpacing;
        displacedNodes[c][r] = this.calculateDisplacement(origX, origY);
      }
    }

    // 2. Draw deformed grid lines
    this.ctx.lineWidth = 1;
    
    // Draw columns
    for (let c = -1; c < cols; c++) {
      for (let r = -1; r < rows - 1; r++) {
        const p1 = displacedNodes[c][r];
        const p2 = displacedNodes[c][r+1];
        
        // Compute fading alpha based on screen edge distance and funnel proximity
        const activeX = window.activeNodeX || this.width / 2;
        const centerDistance = Math.abs(p1.x - activeX) / (this.width / 2);
        const alpha = Math.max(0.01, 0.07 * (1 - centerDistance));
        
        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = `rgba(0, 255, 140, ${alpha * 0.85})`;
        this.ctx.stroke();
      }
    }

    // Draw rows
    for (let r = -1; r < rows; r++) {
      for (let c = -1; c < cols - 1; c++) {
        const p1 = displacedNodes[c][r];
        const p2 = displacedNodes[c+1][r];
        
        const activeX = window.activeNodeX || this.width / 2;
        const centerDistance = Math.abs(p1.x - activeX) / (this.width / 2);
        const alpha = Math.max(0.01, 0.07 * (1 - centerDistance));

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.strokeStyle = `rgba(0, 255, 140, ${alpha * 0.85})`;
        this.ctx.stroke();
      }
    }

    // 3. Draw drifting coordinate data packets
    for (let i = 0; i < this.packets.length; i++) {
      const p = this.packets[i];
      
      // Displace packet position using the same warp mechanics
      const dp = this.calculateDisplacement(p.x, p.y);

      const relativeY = p.y / this.height;
      const currentAlpha = p.alpha * relativeY * (1 - Math.abs(p.x - this.width / 2) / (this.width * 0.6));

      this.ctx.beginPath();
      this.ctx.arc(dp.x, dp.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color + currentAlpha + ")";
      this.ctx.fill();

      // Update baseline coordinates
      p.y -= p.speedY;
      p.x += p.speedX + Math.sin(p.y / p.driftScale) * 0.15;

      // Recycle packets
      if (p.y < -10 || p.x < -10 || p.x > this.width + 10) {
        this.packets[i] = this.createPacket(false);
      }
    }
  }

  animate() {
    this.draw();
    requestAnimationFrame(() => this.animate());
  }
}

// Initialise grid warp on launch
window.addEventListener("DOMContentLoaded", () => {
  new GravitationalWarpGrid("warp-grid-canvas");
});
