define([
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/Code"
],
function(
	$,
	ScrollNavPiece,
	Code) {

	function Rainbow() {

		var self = this;

		this.onBind = function(element) {

			$(element).load("html/rainbow.html");
		};

		// A rainbow has six colours right?
		this.container =
			new ScrollNavPiece([

				{ route: "red", page: stripe(0, "red") },
				{ route: "orange", page: stripe(1, "orange") },
				{ route: "yellow", page: stripe(2, "yellow") },
				{ route: "green", page: stripe(3, "green") },
				{ route: "blue", page: stripe(4, "blue") },
				{ route: "purple", page: stripe(5, "purple") }
			]);

		// Make a stripe by setting CSS classes
		// on the element to which it binds.
		function stripe(index, colour) {

			var classes = {

				stripe: function() { return true; }
			};

			classes[colour] = function() { return true; };

			return new Binding({

				click: function() {

					self.container.showPage(index);
				},
				classes: classes
			});
		}

		this.code = new Code("Rainbow.js");
	}

	return Rainbow;
});
