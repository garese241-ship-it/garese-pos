import { Component, useEffect, useRef, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { SelectionPopup } from "@point_of_sale/app/components/popups/selection_popup/selection_popup";

const AUTO_COLORS = ["blue", "green", "orange", "red", "purple", "teal", "pink", "yellow"];
const DEFAULT_ICON = "fa-tag";
const TILE_MIN_WIDTH = 112;
const TILE_GAP = 8;

// ----------------------------------------------------------------------
// Product card
// ----------------------------------------------------------------------
export class GpProductCard extends Component {
    static template = "garese_pos.GpProductCard";
    static props = {
        product: Object,
        onAdd: Function,
        onInfo: { type: Function, optional: true },
        cartQty: { type: [Number, { value: undefined }], optional: true },
    };

    setup() {
        this.pos = usePos();
    }
    get product() {
        return this.props.product;
    }
    get imageUrl() {
        return this.pos.config.show_product_images && this.product.image_128
            ? this.product.getImageUrl()
            : false;
    }
    get showPlaceholder() {
        return this.pos.config.show_product_images && !this.product.image_128;
    }
    get price() {
        return this.pos.gpFormat(this.product.gpDisplayPrice());
    }
    get promo() {
        const promo = this.product.gpPromo;
        return promo ? { percent: promo.percent, oldPrice: this.pos.gpFormat(promo.oldPrice) } : false;
    }
    get brand() {
        return (this.pos.config.gp_show_brand && this.product.gpBrandName) || "";
    }
    get stockState() {
        return this.product.gpStockState;
    }
    get stockLabel() {
        const state = this.stockState;
        if (state === "out") {
            return _t("No stock");
        }
        if (!state) {
            return "";
        }
        const qty = Number((this.product._gp_qty || 0).toFixed(2));
        return _t("In stock: %s", this.env.utils.formatProductQty(qty, false));
    }
    get favorite() {
        return Boolean(this.product.gp_pos_favorite);
    }
    get popular() {
        return this.product._gp_popular_rank > 0;
    }
    get cartQty() {
        return this.props.cartQty ? this.env.utils.formatProductQty(this.props.cartQty, false) : "";
    }
    toggleFavorite() {
        this.pos.gpToggleFavorite(this.product);
    }
}

// ----------------------------------------------------------------------
// Category tiles
// ----------------------------------------------------------------------
export class GpCategoryBar extends Component {
    static template = "garese_pos.GpCategoryBar";
    static props = {};

    setup() {
        this.pos = usePos();
        this.root = useRef("root");
        this.state = useState({ slots: 20 });
        useEffect(
            () => {
                const el = this.root.el;
                if (!el) {
                    return;
                }
                const update = () => {
                    const width = el.clientWidth;
                    if (width) {
                        this.state.slots = Math.max(
                            3,
                            Math.floor((width + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP))
                        );
                    }
                };
                const observer = new ResizeObserver(update);
                observer.observe(el);
                update();
                return () => observer.disconnect();
            },
            () => []
        );
    }
    get tiles() {
        const showImages = this.pos.config.show_category_images;
        return this.pos.rootCategories
            .map((category, index) => ({
            id: category.id,
            name: category.name,
            count: this.pos.gpCategoryCount(category),
            color: category.gp_color || AUTO_COLORS[index % AUTO_COLORS.length],
            icon: category.gp_icon || DEFAULT_ICON,
            imageUrl:
                showImages &&
                category.has_image &&
                `/web/image?model=pos.category&field=image_128&id=${category.id}&unique=${category.write_date}`,
            }))
            .filter((tile) => tile.count > 0);
    }
    get allCount() {
        return this.pos.gpSellableProducts.length;
    }
    /** Top level category owning the selected one (0 when none). */
    get activeRootId() {
        let category = this.pos.selectedCategory;
        if (!category?.id) {
            return 0;
        }
        while (category.parent_id) {
            category = category.parent_id;
        }
        return category.id;
    }
    get capacity() {
        const free = this.state.slots - 2;
        const count = this.tiles.length;
        return count <= free ? free : Math.max(free - 1, 0);
    }
    get visibleTiles() {
        const tiles = this.tiles;
        const visible = tiles.slice(0, this.capacity);
        const active = tiles.find((tile) => tile.id === this.activeRootId);
        if (active && !visible.includes(active) && visible.length) {
            visible[visible.length - 1] = active;
        }
        return visible;
    }
    get hiddenTiles() {
        const visible = new Set(this.visibleTiles.map((tile) => tile.id));
        return this.tiles.filter((tile) => !visible.has(tile.id));
    }
    countLabel(count) {
        return count === 1 ? _t("1 product") : _t("%s products", count);
    }
    selectCategory(id) {
        this.pos.searchProductWord = "";
        if (this.pos.selectedCategory?.id === id) {
            // keep the category open (the standard toggles it off)
            this.pos.gpHome = false;
            return;
        }
        this.pos.setSelectedCategory(id);
    }
    async openMore() {
        const id = await makeAwaitable(this.env.services.dialog, SelectionPopup, {
            title: _t("Categories"),
            list: this.hiddenTiles.map((tile) => ({
                id: tile.id,
                label: `${tile.name} (${tile.count})`,
                isSelected: tile.id === this.activeRootId,
                item: tile.id,
            })),
        });
        if (id) {
            this.selectCategory(id);
        }
    }
}

// ----------------------------------------------------------------------
// Catalog: right pane of the product screen
// ----------------------------------------------------------------------
export class GpCatalog extends Component {
    static template = "garese_pos.GpCatalog";
    static components = { GpCategoryBar, GpProductCard };
    static props = {
        onAdd: Function,
        cartQty: { type: Object, optional: true },
    };

    setup() {
        this.pos = usePos();
    }
    get searchWord() {
        return (this.pos.searchProductWord || "").trim();
    }
    get isHome() {
        return this.pos.gpHome && !this.searchWord && !this.pos.selectedCategory?.id;
    }
    onInfo(product) {
        this.pos.onProductInfoClick(product);
    }
    qtyOf(product) {
        return this.props.cartQty?.[product.id];
    }

    // -------------------------- sub categories --------------------------
    get subCategories() {
        const selected = this.pos.selectedCategory;
        if (this.pos.gpHome || !selected?.id || this.searchWord) {
            return null;
        }
        const ancestors = [];
        let parent = selected.parent_id;
        while (parent) {
            ancestors.unshift(parent);
            parent = parent.parent_id;
        }
        let path = [...ancestors, selected];
        let children = [...selected.child_ids];
        if (!children.length && ancestors.length) {
            path = ancestors;
            children = [...ancestors[ancestors.length - 1].child_ids];
        }
        if (path.length < 2 && !children.length) {
            return null;
        }
        return { path, children, selected: selected.id };
    }

    // ----------------------------- sections -----------------------------
    get promoToDisplay() {
        if (!this.pos.config.gp_promo_first || !this.isHome) {
            return [];
        }
        return this.pos
            .gpApplyFilter(this.pos.gpPromoProducts)
            .sort((a, b) => b.gpPromo.percent - a.gpPromo.percent);
    }
    get popularToDisplay() {
        if (!this.isHome) {
            return [];
        }
        const promo = new Set(this.promoToDisplay.map((p) => p.id));
        return this.pos.gpApplyFilter(this.pos.gpPopularProducts).filter((p) => !promo.has(p.id));
    }
    get showSections() {
        return this.promoToDisplay.length > 0 || this.popularToDisplay.length > 0;
    }
    /** Main list: category / search, GARESE filter and sort, best sellers left out on Home. */
    get allProducts() {
        let products;
        if (this.searchWord) {
            products = this.pos.getProductsBySearchWord(
                this.searchWord,
                this.pos.gpSellableProducts
            );
            products = this.pos.gpApplyFilter(products);
            return this.pos.gpSort === "default" ? products : this.pos.gpApplySort(products);
        }
        products = this.pos.gpApplyFilter(this.pos.gpProductsOfCategory(this.pos.selectedCategory));
        if (this.showSections) {
            const shown = new Set(
                [...this.promoToDisplay, ...this.popularToDisplay].map((p) => p.id)
            );
            products = products.filter((p) => !shown.has(p.id));
        }
        return this.pos.gpApplySort(products);
    }
    get productsToDisplay() {
        return this.allProducts.slice(0, this.pos.gpLimit);
    }
    get hasMoreProducts() {
        return this.allProducts.length > this.pos.gpLimit;
    }
    get listTitle() {
        if (this.searchWord) {
            return _t('Results for "%s"', this.searchWord);
        }
        if (this.promoToDisplay.length) {
            return _t("Promotions");
        }
        if (this.showSections) {
            return _t("Popular products");
        }
        return this.pos.selectedCategory?.name || _t("All products");
    }
    get filters() {
        const filters = [
            { key: "all", label: _t("All") },
            { key: "favorite", label: _t("Favorites"), icon: "fa-star" },
            { key: "promo", label: _t("Promo"), icon: "fa-tag" },
        ];
        if (this.pos.config.gp_show_stock) {
            filters.push({ key: "stock", label: _t("In stock"), icon: "fa-archive" });
        }
        return filters;
    }
    async openSort() {
        const options = [
            { key: "default", label: _t("Default order") },
            { key: "name", label: _t("Name (A to Z)") },
            { key: "price_asc", label: _t("Price: low to high") },
            { key: "price_desc", label: _t("Price: high to low") },
        ];
        if (this.pos.config.gp_show_stock) {
            options.push({ key: "stock", label: _t("Stock: highest first") });
        }
        const key = await makeAwaitable(this.env.services.dialog, SelectionPopup, {
            title: _t("Sort products"),
            list: options.map((option, index) => ({
                id: index + 1,
                label: option.label,
                isSelected: option.key === this.pos.gpSort,
                item: option.key,
            })),
        });
        if (key) {
            this.pos.gpSetSort(key);
        }
    }

    // ---------------------------- daily goal ----------------------------
    get goal() {
        return this.pos.gpGoal;
    }
}
