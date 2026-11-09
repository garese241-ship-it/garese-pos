import { patch } from "@web/core/utils/patch";
import { ProductTemplate } from "@point_of_sale/app/models/product_template";
import { PosOrder } from "@point_of_sale/app/models/pos_order";
import { gpCtx } from "@garese_pos/app/utils/gp_context";

const EPSILON = 0.000001;

// ----------------------------------------------------------------------
// Product template: displayed price, promotion, stock
// ----------------------------------------------------------------------
patch(ProductTemplate.prototype, {
    get gpPos() {
        return this.models["pos.config"].getFirst();
    },
    get gpIsStorable() {
        return Boolean(this.is_storable);
    },
    /** Pricelist of the current order (or of the Point of Sale). */
    gpPricelist() {
        const order = gpCtx.pos?.getOrder?.();
        return order?.pricelist_id || this.gpPos?.pricelist_id || false;
    },
    /** Price as shown to the customer (taxes included or not, as configured). */
    gpDisplayPrice(pricelist = this.gpPricelist(), price = false) {
        const config = this.gpPos;
        const overridedValues = { pricelist };
        if (price !== false) {
            overridedValues.price = price;
        }
        try {
            const details = this.getTaxDetails({ overridedValues });
            return config?.iface_tax_included === "total"
                ? details.total_included
                : details.total_excluded;
        } catch {
            return this.list_price;
        }
    },
    /**
     * Promotion of the pricelist: { percent, oldPrice } when the product is
     * sold below its public price, false otherwise.
     */
    gpPromoFor(pricelist) {
        if (!pricelist || this.isCombo()) {
            return false;
        }
        const variant = this.product_variant_ids[0];
        let price;
        try {
            price = this.getPrice(pricelist, 1, 0, false, variant || false);
        } catch {
            return false;
        }
        const publicPrice = variant?.lst_price ?? this.list_price;
        if (!(price < publicPrice - EPSILON)) {
            return false;
        }
        const now = this.gpDisplayPrice(pricelist);
        const before = this.gpDisplayPrice(pricelist, publicPrice);
        if (!(before > 0) || now >= before - EPSILON) {
            return false;
        }
        return {
            percent: Math.max(1, Math.round((1 - now / before) * 100)),
            oldPrice: before,
        };
    },
    get gpPromo() {
        return this.gpPromoFor(this.gpPricelist());
    },
    /** "out" | "low" | "ok" | false (no stock tracking for this product). */
    get gpStockState() {
        const config = this.gpPos;
        if (!config?.gp_show_stock || !this.gpIsStorable) {
            return false;
        }
        const qty = this._gp_qty || 0;
        if (qty <= 0) {
            return "out";
        }
        return qty <= config.gp_low_stock_threshold ? "low" : "ok";
    },
    get gpBrandName() {
        return this.gp_brand_id?.name || "";
    },
});

// ----------------------------------------------------------------------
// Order: waiter and customer note
// ----------------------------------------------------------------------
patch(PosOrder.prototype, {
    setup(vals) {
        super.setup(...arguments);
        if (!this.gp_note) {
            this.gp_note = "";
        }
    },
    initState() {
        super.initState(...arguments);
        // New order: the waiter proposed by default (the restaurant gives the
        // waiter of the table).
        if (!this.isSynced && this.gp_waiter_id === undefined) {
            this.gp_waiter_id = false;
        }
    },
    get gpWaiterName() {
        return this.gp_waiter_id?.name || "";
    },
});
