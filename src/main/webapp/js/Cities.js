define([
	"jquery",
	"js/pieces/SlideNavPiece",
	"js/Picture",
	"js/Code"
], function(
	$,
	SlideNavPiece,
	Picture,
	Code) {

	function Cities() {

		this.onBind = function(element) {

			$(element).load("html/cities.html");
		};

		this.cities =
			new SlideNavPiece([
				{
					route: "london",
					page: new Picture("photo-1505761671935-60b3a7427bad")
				},
				{
					route: "berlin",
					page: new Picture("photo-1559564484-e48b3e040ff4")
				},
				{
					route: "delhi",
					page: new Picture("photo-1513014576558-921f00d80b77")
				}
			]);

		this.left = new Binding({

			click: function() {

				var index = this.cities.getCurrentIndex();

				if (index > 0) {

					this.cities.showPage(--index);
				}
			},
			visible: function() {

				return this.cities.getCurrentIndex() > 0;
			}
		});

		this.right = new Binding({

			click: function() {

				var index = this.cities.getCurrentIndex();

				if (index < 2) {

					this.cities.showPage(++index || 1);
				}
			},
			visible: function() {

				return this.cities.getCurrentIndex() < 2;
			}
		});

		this.code = new Code("Cities.js");
	}

	return Cities;
});
