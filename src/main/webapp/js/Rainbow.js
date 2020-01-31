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

		this.onBind = function(element) {

			$(element).load("html/rainbow.html");
		};

		// Create scroll navigation container.
		this.container =
			new ScrollNavPiece([

				{ route: "red", page: stripe("red") },
				{ route: "orange", page: stripe("orange") },
				{ route: "yellow", page: stripe("yellow") },
				{ route: "green", page: stripe("green") },
				{ route: "blue", page: stripe("blue") },
				{ route: "purple", page: stripe("purple") }
			]);

		this.code = new Code("Rainbow.js");
	}

	function stripe(colour) {

		var classes = {

			stripe: function() { return true; }
		};

		classes[colour] = function() { return true; };

		return new Classes(classes);
	}

	return Rainbow;
});
