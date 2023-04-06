define([
	"jquery",
	"js/pieces/FadeNavPiece",
	"js/Picture",
	"js/Code"
], function(
	$,
	FadeNavPiece,
	Picture,
	Code) {

	function Vegetables() {

		var index = 0;

		this.onBind = function(element) {

			$(element).load("html/vegetables.html");
		};

		this.vegetables =
			new FadeNavPiece([
				{
					route: "carrot",
					page: () => new Picture("photo-1447175008436-054170c2e979")
				},
				{
					route: "cabbage",
					page: () => new Picture("photo-1550177564-5cf7f9279d8b")
				},
				{
					route: "squash",
					page: () => new Picture("photo-1507919181268-0a42063f9704")
				}
			]);

		// Click to cycle between pictures.
		this.change = new Binding({

			init: function() {

				index = Math.max(this.vegetables.getCurrentIndex(), 0);
			},
			click: function() {

				this.vegetables.showPage(++index % 3);
			}
		});

		this.code = new Code("Vegetables.js");
	}

	return Vegetables;
});
