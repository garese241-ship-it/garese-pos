/** @odoo-module */

import { Component, onWillUnmount, useState } from "@odoo/owl";

const { DateTime } = luxon;

/** Time and date in the top bar, in the language and timezone of the user. */
export class GpClock extends Component {
    static template = "garese_pos.GpClock";
    static props = {};

    setup() {
        this.state = useState({ now: DateTime.now() });
        const timer = setInterval(() => {
            this.state.now = DateTime.now();
        }, 10000);
        onWillUnmount(() => clearInterval(timer));
    }
    get time() {
        return this.state.now.toLocaleString(DateTime.TIME_SIMPLE);
    }
    get date() {
        return this.state.now.toLocaleString({
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    }
}
