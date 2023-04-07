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
					page: new Picture("photo-1513635269975-59663e0ac1ad")
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

		// Click on the left to go back.
		this.left = new Binding({

			click: function() {

				var index = this.cities.getCurrentIndex();

				if (index > 0) {

					this.cities.showPage(--index);
				}
			},
			visible: function() {

				// Hide the back button when at the beginning.
				return this.cities.getCurrentIndex() > 0;
			}
		});

		// Click on the right to go forward.
		this.right = new Binding({

			click: function() {

				var index = this.cities.getCurrentIndex();

				if (index < 2) {

					this.cities.showPage(++index || 1);
				}
			},
			visible: function() {

				// Hide the forward button when at the end.
				return this.cities.getCurrentIndex() < 2;
			}
		});

		this.code = new Code("Cities.js");
	}

	return Cities;
});
