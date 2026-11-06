/** @odoo-module */

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";

/** Adds the bag product configured on the Point of Sale to the order. */
export class GpBagButton extends Component {
    static template = "garese_pos.GpBagButton";

    setup() {
        this.pos = usePos();
    }
}

/** Manual entry of a barcode / internal reference (damaged label, no scanner). */
export class GpEnterCodeButton extends Component {
    static template = "garese_pos.GpEnterCodeButton";

    setup() {
        this.pos = usePos();
    }
}

/** Waiter who serves the customers of the order (Point of Sale setting). */
export class GpWaiterButton extends Component {
    static template = "garese_pos.GpWaiterButton";

    setup() {
        this.pos = usePos();
    }
    get waiterName() {
        return this.pos.get_order()?.gpWaiterName || "";
    }
}

ProductScreen.addControlButton({
    component: GpWaiterButton,
    position: ["before", "RefundButton"],
    condition: function () {
        return this.pos.gpUseWaiter;
    },
});

ProductScreen.addControlButton({
    component: GpBagButton,
    position: ["after", "RefundButton"],
    condition: function () {
        return Boolean(this.pos.config.gp_bag_product_id);
    },
});

ProductScreen.addControlButton({
    component: GpEnterCodeButton,
    position: ["after", "GpBagButton"],
});
