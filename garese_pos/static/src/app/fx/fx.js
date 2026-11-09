

/**
 * Small visual / sound effects of the GARESE Point of Sale.
 * Pure helpers: nothing here touches the order or the server.
 */

let audioContext = null;

function getAudioContext() {
    if (audioContext) {
        return audioContext;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
        return null;
    }
    try {
        audioContext = new Ctx();
    } catch {
        audioContext = null;
    }
    return audioContext;
}

// [frequency (Hz), start (s), duration (s)]
const GP_TONES = {
    add: [[880, 0, 0.09], [1175, 0.07, 0.12]],
    success: [[660, 0, 0.12], [880, 0.1, 0.12], [1320, 0.2, 0.28]],
    error: [[220, 0, 0.16], [165, 0.14, 0.26]],
    goal: [[523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.35]],
};

/** Play a short synthesized tone (no audio file to ship). Silent on failure. */
export function gpPlaySound(kind) {
    const ctx = getAudioContext();
    const notes = GP_TONES[kind];
    if (!ctx || !notes) {
        return;
    }
    try {
        if (ctx.state === "suspended") {
            ctx.resume();
        }
        const now = ctx.currentTime;
        for (const [frequency, start, duration] of notes) {
            const oscillator = ctx.createOscillator();
            const gain = ctx.createGain();
            oscillator.type = kind === "error" ? "triangle" : "sine";
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + start);
            gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
            oscillator.connect(gain).connect(ctx.destination);
            oscillator.start(now + start);
            oscillator.stop(now + start + duration + 0.02);
        }
    } catch {
        // Audio is a nice-to-have.
    }
}

/** Retrigger a CSS animation class on an element. */
export function gpPulse(element, className = "gp-bump", duration = 450) {
    if (!element) {
        return;
    }
    element.classList.remove(className);
    // Force a reflow so the animation restarts.
    void element.offsetWidth;
    element.classList.add(className);
    setTimeout(() => element.classList.remove(className), duration);
}

/**
 * The picture of a product "flies" from its tile to the cart icon.
 * @param {HTMLElement} source tile (or any element) the product starts from
 * @param {HTMLElement} target element the product flies to
 */
export function gpFlyToCart(source, target) {
    if (!source || !target || !source.isConnected || !target.isConnected) {
        return;
    }
    if (!source.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        return;
    }
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    if (!from.width || !to.width) {
        return;
    }
    const size = Math.min(64, from.width, from.height) || 48;
    const ghost = document.createElement("div");
    ghost.className = "gp-fly";
    const img = source.querySelector("img");
    if (img) {
        const clone = img.cloneNode();
        clone.removeAttribute("class");
        ghost.appendChild(clone);
    } else {
        ghost.innerHTML = '<i class="fa fa-shopping-bag"></i>';
    }
    Object.assign(ghost.style, {
        position: "fixed",
        zIndex: 99999,
        left: `${from.left + from.width / 2 - size / 2}px`,
        top: `${from.top + from.height / 2 - size / 2}px`,
        width: `${size}px`,
        height: `${size}px`,
        pointerEvents: "none",
    });
    document.body.appendChild(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const animation = ghost.animate(
        [
            { transform: "translate(0, 0) scale(1)", opacity: 1 },
            { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 70}px) scale(0.8)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.25 },
        ],
        { duration: 650, easing: "cubic-bezier(.4,.1,.3,1)" }
    );
    const done = () => ghost.remove();
    animation.onfinish = done;
    animation.oncancel = done;
    setTimeout(done, 1200);
}
