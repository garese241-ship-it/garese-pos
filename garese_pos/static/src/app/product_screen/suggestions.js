import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";

/** "Often bought with": products sold in the same orders as the selected one. */
export class GpSuggestions extends Component {
    static template = "garese_pos.GpSuggestions";
    static props = { template: Object };

    setup() {
        this.pos = usePos();
    }
    get suggestions() {
        const inCart = (this.pos.getOrder()?.lines || []).map(
            (line) => line.product_id?.product_tmpl_id?.id
        );
        return this.pos.gpSuggestionsFor(this.props.template, inCart);
    }
    price(product) {
        return this.pos.gpFormat(product.gpDisplayPrice());
    }
    imageUrl(product) {
        return product.image_128 ? product.getImageUrl() : false;
    }
    add(product) {
        this.pos.addLineToCurrentOrder({ product_tmpl_id: product }, {});
    }
}
