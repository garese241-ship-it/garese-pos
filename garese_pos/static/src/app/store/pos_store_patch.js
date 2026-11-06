/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { Product } from "@point_of_sale/app/store/models";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup";

const GP_VIEW_MODE_KEY = "garese_pos.viewMode";
const GP_CALCULATOR_KEY = "garese_pos.calculator";
// Odoo's own display limit (PosDB.limit); "Show more" raises it step by step.
const GP_PAGE_SIZE = 100;

function readLocalStorage(key, fallback) {
    try {
        return window.localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
}

function writeLocalStorage(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Private browsing / storage disabled: the preference is just not kept.
    }
}

patch(PosStore.prototype, {
    async setup() {
        // UI state of the GARESE product screen. Declared before the data is
        // loaded so that every screen can rely on it.
        this.gpHome = true; // "Home" tile: popular products first
        this.gpFilter = "all"; // all | favorite | promo | stock
        this.gpSort = "default"; // default | name | price_asc | price_desc | stock
        this.gpViewMode = readLocalStorage(GP_VIEW_MODE_KEY, "grid"); // grid | list
        this.gpShowCalculator = readLocalStorage(GP_CALCULATOR_KEY, "1") === "1";
        this.gpStockTimer = null;
        this.gpWaiters = []; // waiters selectable on the orders (Point of Sale setting)
        await super.setup(...arguments);
    },
    async _processData(loadedData) {
        await super._processData(...arguments);
        this.gpWaiters = loadedData["garese.pos.waiter"] || [];
    },

    // ------------------------------------------------------------------
    // Waiter of an order
    // ------------------------------------------------------------------
    get gpUseWaiter() {
        return Boolean(this.config.gp_use_waiter) && this.gpWaiters.length > 0;
    },
    gpWaiterName(waiterId) {
        return this.gpWaiters.find((waiter) => waiter.id === waiterId)?.name || "";
    },
    /**
     * Let the cashier pick a waiter in the list.
     * @returns {Promise<number|false|undefined>} id, false ("no waiter") or
     *  undefined when the popup is dismissed
     */
    async gpPickWaiter({ title, selectedId = false, allowNone = true } = {}) {
        const list = this.gpWaiters.map((waiter) => ({
            id: waiter.id,
            label: waiter.name,
            isSelected: waiter.id === selectedId,
            item: waiter.id,
        }));
        if (allowNone) {
            list.push({ id: 0, label: _t("No waiter"), isSelected: !selectedId, item: false });
        }
        const { confirmed, payload } = await this.popup.add(SelectionPopup, {
            title: title || _t("Who serves this order?"),
            list,
        });
        return confirmed ? payload : undefined;
    },
    /** Waiter of the order, chosen by the cashier. @returns {Promise<boolean>} chosen */
    async gpSelectWaiter(order = this.get_order(), options = {}) {
        if (!order || !this.gpUseWaiter) {
            return false;
        }
        const waiterId = await this.gpPickWaiter({ selectedId: order.gp_waiter_id, ...options });
        if (waiterId === undefined) {
            return false;
        }
        order.gpSetWaiter(waiterId);
        return true;
    },

    async after_load_server_data() {
        const res = await super.after_load_server_data(...arguments);
        // Screen ambiance: the palettes are CSS variables switched on <body>,
        // so popups and native screens follow ("soft" needs no class).
        const ambiance = this.config.gp_ambiance || "soft";
        document.body.classList.remove("gp-amb-bright", "gp-amb-soft", "gp-amb-dim");
        document.body.classList.add(`gp-amb-${ambiance}`);
        // A start category configured on the Point of Sale wins over "Home".
        this.gpHome = !this.selectedCategoryId;
        const minutes = this.config.gp_stock_refresh_minutes;
        if (this.config.gp_show_stock && minutes > 0 && !this.gpStockTimer) {
            this.gpStockTimer = setInterval(() => this.gpRefreshStock(), minutes * 60 * 1000);
        }
        return res;
    },

    // ------------------------------------------------------------------
    // Navigation between Home / All / categories
    // ------------------------------------------------------------------
    setSelectedCategoryId(categoryId) {
        super.setSelectedCategoryId(...arguments);
        this.gpHome = false;
        this.db.limit = GP_PAGE_SIZE;
    },
    resetProductScreenSearch() {
        super.resetProductScreenSearch(...arguments);
        this.gpHome = !this.selectedCategoryId;
        this.db.limit = GP_PAGE_SIZE;
    },
    gpGoHome() {
        this.selectedCategoryId = 0;
        this.gpHome = true;
        this.db.limit = GP_PAGE_SIZE;
    },
    gpShowMoreProducts() {
        this.db.limit += GP_PAGE_SIZE;
    },
    gpSetFilter(filter) {
        this.gpFilter = filter;
    },
    gpSetSort(sort) {
        this.gpSort = sort;
    },
    gpSetViewMode(mode) {
        this.gpViewMode = mode;
        writeLocalStorage(GP_VIEW_MODE_KEY, mode);
    },
    gpToggleCalculator() {
        this.gpShowCalculator = !this.gpShowCalculator;
        writeLocalStorage(GP_CALCULATOR_KEY, this.gpShowCalculator ? "1" : "0");
    },

    // ------------------------------------------------------------------
    // Stock
    // ------------------------------------------------------------------
    _after_flush_orders(orders) {
        super._after_flush_orders(...arguments);
        const productIds = new Set();
        for (const order of orders || []) {
            for (const line of order?.data?.lines || []) {
                if (line[2]?.product_id) {
                    productIds.add(line[2].product_id);
                }
            }
        }
        if (productIds.size) {
            this.gpRefreshStock([...productIds]);
        }
    },
    /**
     * Re-read the stock of the given products (all loaded storable products
     * when omitted). Never blocks nor interrupts a sale: when the server is
     * unreachable the badges simply keep their last known value.
     */
    async gpRefreshStock(productIds) {
        if (!this.config.gp_show_stock) {
            return;
        }
        const ids =
            productIds ||
            Object.values(this.db.product_by_id)
                .filter((product) => product.type === "product")
                .map((product) => product.id);
        if (!ids.length) {
            return;
        }
        try {
            const stock = await this.orm.silent.call("pos.session", "gp_get_stock", [
                [this.pos_session.id],
                ids,
            ]);
            for (const [id, qty] of Object.entries(stock)) {
                const product = this.db.product_by_id[id];
                if (product) {
                    product.gp_qty = qty;
                }
            }
        } catch {
            // Offline or server error: keep the last known quantities.
        }
    },

    // ------------------------------------------------------------------
    // Favorites
    // ------------------------------------------------------------------
    get gpCanEditFavorites() {
        return !this.config.gp_favorite_manager_only || this.get_cashier()?.role === "manager";
    },
    async gpToggleFavorite(product) {
        if (!this.gpCanEditFavorites) {
            return;
        }
        const value = !product.gp_pos_favorite;
        // The flag lives on the template: keep all loaded variants in sync.
        // (PosDB stores product_tmpl_id as a plain id, the server as [id, name].)
        const templateId = (p) =>
            Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : p.product_tmpl_id;
        const siblings = Object.values(this.db.product_by_id).filter(
            (p) => templateId(p) === templateId(product)
        );
        siblings.forEach((p) => (p.gp_pos_favorite = value));
        try {
            await this.orm.silent.call("product.product", "gp_set_pos_favorite", [
                [product.id],
                value,
            ]);
        } catch {
            siblings.forEach((p) => (p.gp_pos_favorite = !value));
            this.env.services.pos_notification.add(
                _t("Favorites cannot be changed while offline."),
                3000
            );
        }
    },

    // ------------------------------------------------------------------
    // Bag button / manual code entry
    // ------------------------------------------------------------------
    async gpAddBag() {
        const bagId = this.config.gp_bag_product_id?.[0];
        if (!bagId) {
            return;
        }
        let product = this.db.get_product_by_id(bagId);
        if (!product) {
            // Not part of the categories loaded in this Point of Sale.
            try {
                await this._addProducts([bagId], false);
            } catch {
                // handled below
            }
            product = this.db.get_product_by_id(bagId);
        }
        if (!product) {
            this.popup.add(ErrorPopup, {
                title: _t("Bag product unavailable"),
                body: _t("The bag product could not be loaded. Check the Point of Sale settings."),
            });
            return;
        }
        await this.addProductToCurrentOrder(product);
    },
    async gpEnterCode() {
        const { confirmed, payload } = await this.popup.add(TextInputPopup, {
            title: _t("Enter a code"),
            placeholder: _t("Barcode or internal reference"),
        });
        const code = (payload || "").trim();
        if (!confirmed || !code) {
            return;
        }
        // 1. Internal reference of a loaded product.
        const lowered = code.toLowerCase();
        const byReference = Object.values(this.db.product_by_id).find(
            (product) => product.default_code && product.default_code.toLowerCase() === lowered
        );
        if (byReference && !this.db.get_product_by_barcode(code)) {
            await this.addProductToCurrentOrder(byReference);
            return;
        }
        // 2. Anything else goes through the regular barcode pipeline, exactly
        //    as if the code had been scanned (products, customers, coupons...).
        await this.barcodeReader.scan(code);
    },
});

patch(Product.prototype, {
    get gpIsStorable() {
        return this.type === "product";
    },
    /** True when the current pricelist sells the product below its public price. */
    get gpIsPromo() {
        const pricelist = this.pos.get_order()?.pricelist || this.pos.default_pricelist;
        if (!pricelist) {
            return false;
        }
        return this.get_price(pricelist, 1) < this.lst_price - 0.000001;
    },
    /** "out" | "low" | "ok" | false (no stock tracking for this product). */
    get gpStockState() {
        if (!this.pos.config.gp_show_stock || !this.gpIsStorable) {
            return false;
        }
        if (this.gp_qty <= 0) {
            return "out";
        }
        return this.gp_qty <= this.pos.config.gp_low_stock_threshold ? "low" : "ok";
    },
});
