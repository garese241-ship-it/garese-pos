/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

const OPERATIONS = {
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "*": (a, b) => a * b,
    "/": (a, b) => (b === 0 ? NaN : a / b),
};
const MAX_DIGITS = 12;

/**
 * Small pocket calculator for the cashier (change to give back, quick
 * totals...). It is deliberately independent from the order: it never reads
 * nor writes the cart, and only reacts to clicks so that it never competes
 * with the numpad for the keyboard.
 */
export class GpCalculator extends Component {
    static template = "garese_pos.GpCalculator";
    static props = {
        onClose: { type: Function, optional: true },
    };

    setup() {
        this.localization = useService("localization");
        this.state = useState({
            entry: "0", // what is being typed, with "." as decimal separator
            accumulator: null,
            operator: null,
            fresh: true, // next digit starts a new number
            error: false,
        });
    }

    get keys() {
        const point = this.localization.decimalPoint;
        return [
            { key: "clear", label: "C", type: "fn" },
            { key: "back", icon: "fa-long-arrow-left", type: "fn" },
            { key: "%", label: "%", type: "fn" },
            { key: "/", label: "÷", type: "op" },
            { key: "7", label: "7" },
            { key: "8", label: "8" },
            { key: "9", label: "9" },
            { key: "*", label: "×", type: "op" },
            { key: "4", label: "4" },
            { key: "5", label: "5" },
            { key: "6", label: "6" },
            { key: "-", label: "−", type: "op" },
            { key: "1", label: "1" },
            { key: "2", label: "2" },
            { key: "3", label: "3" },
            { key: "+", label: "+", type: "op" },
            { key: "0", label: "0" },
            { key: ".", label: point },
            { key: "=", label: "=", type: "eq", wide: true },
        ];
    }

    get display() {
        if (this.state.error) {
            return "—";
        }
        const [integer, decimals] = this.state.entry.split(".");
        const negative = integer.startsWith("-");
        const digits = negative ? integer.slice(1) : integer;
        const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        const point = this.localization.decimalPoint;
        return (
            (negative ? "-" : "") + grouped + (decimals !== undefined ? point + decimals : "")
        );
    }

    isActive(key) {
        return key.type === "op" && this.state.operator === key.key && this.state.fresh;
    }

    onKey(key) {
        if (this.state.error && key !== "clear") {
            this.reset();
        }
        if (key === "clear") {
            this.reset();
        } else if (key === "back") {
            this.backspace();
        } else if (key === "%") {
            this.percent();
        } else if (key === "=") {
            this.compute();
            this.state.operator = null;
            this.state.accumulator = null;
            this.state.fresh = true;
        } else if (key in OPERATIONS) {
            this.setOperator(key);
        } else {
            this.typeDigit(key);
        }
    }

    reset() {
        Object.assign(this.state, {
            entry: "0",
            accumulator: null,
            operator: null,
            fresh: true,
            error: false,
        });
    }

    typeDigit(char) {
        let entry = this.state.fresh ? "0" : this.state.entry;
        if (char === ".") {
            if (entry.includes(".")) {
                this.state.fresh = false;
                this.state.entry = entry;
                return;
            }
            entry += ".";
        } else if (entry === "0") {
            entry = char;
        } else if (entry.replace(/[-.]/g, "").length < MAX_DIGITS) {
            entry += char;
        }
        this.state.entry = entry;
        this.state.fresh = false;
    }

    backspace() {
        if (this.state.fresh) {
            return;
        }
        const entry = this.state.entry.slice(0, -1);
        this.state.entry = entry === "" || entry === "-" ? "0" : entry;
    }

    percent() {
        const value = parseFloat(this.state.entry);
        // "200 + 10 %" means 10 % of 200, like on a desk calculator.
        const base = this.state.accumulator !== null && this.state.operator ? this.state.accumulator : 1;
        this.setEntry((base * value) / 100);
        this.state.fresh = false;
    }

    setOperator(operator) {
        if (this.state.operator && !this.state.fresh) {
            this.compute();
        }
        if (this.state.error) {
            return;
        }
        this.state.accumulator = parseFloat(this.state.entry);
        this.state.operator = operator;
        this.state.fresh = true;
    }

    compute() {
        const { operator, accumulator } = this.state;
        if (!operator || accumulator === null) {
            return;
        }
        this.setEntry(OPERATIONS[operator](accumulator, parseFloat(this.state.entry)));
    }

    setEntry(value) {
        if (!Number.isFinite(value)) {
            this.state.error = true;
            this.state.entry = "0";
            return;
        }
        // Avoid 0.1 + 0.2 = 0.30000000000000004 and keep the display short.
        let text = String(Number(value.toPrecision(MAX_DIGITS)));
        if (text.includes("e")) {
            text = value.toFixed(6).replace(/\.?0+$/, "");
        }
        this.state.entry = text;
    }
}
