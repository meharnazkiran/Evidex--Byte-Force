/**
 * EVIDEX — Dynamic 3D Cursor-Tracking Card Parallax
 * Computes coordinate shifts on mousemove to tilt foreground HUD panels along the 3D grid plane.
 */

class InteractiveParallax {
  constructor(cardSelector, maxTilt = 10) {
    this.cards = document.querySelectorAll(cardSelector);
    this.maxTilt = maxTilt;
    if (this.cards.length === 0) return;
    
    this.init();
  }

  init() {
    this.cards.forEach(card => {
      // Set transitions for enter / leave smooth animation resetting
      card.style.transition = "transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1), border-color 0.3s ease, box-shadow 0.3s ease";
      
      card.addEventListener("mousemove", (e) => this.handleMouseMove(e, card));
      card.addEventListener("mouseleave", () => this.handleMouseLeave(card));
      card.addEventListener("mouseenter", () => this.handleMouseEnter(card));
    });
  }

  handleMouseMove(e, card) {
    const rect = card.getBoundingClientRect();
    
    // Relative coordinates inside the card container (0 to cardWidth/Height)
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Normalized coordinates (-1 to 1)
    const normalizedX = (x / rect.width) * 2 - 1;
    const normalizedY = (y / rect.height) * 2 - 1;
    
    // Calculate rotation angles (invert X to follow mouse standard)
    const rotateX = -(normalizedY * this.maxTilt).toFixed(2);
    const rotateY = (normalizedX * this.maxTilt).toFixed(2);
    
    // Slight translate offset in response to mouse
    const translateX = (normalizedX * 6).toFixed(1);
    const translateY = (normalizedY * 6).toFixed(1);
    
    // Apply transform matrix preserving 3D z-depth priority
    card.style.transform = `translate3d(${translateX}px, ${translateY}px, 110px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  }

  handleMouseEnter(card) {
    // Disable CSS animations temporarily to prevent jump cuts during cursor operations
    card.style.animationPlayState = "paused";
  }

  handleMouseLeave(card) {
    // Reset to baseline zero-gravity layout
    card.style.transform = `translate3d(0px, 0px, 100px) rotateX(0deg) rotateY(0deg)`;
    
    // Resume micro-buoyancy drift calculations
    card.style.animationPlayState = "running";
  }
}

// Initialise parallax tracking when document completes loading
window.addEventListener("DOMContentLoaded", () => {
  new InteractiveParallax(".tilt-card", 12);
});
