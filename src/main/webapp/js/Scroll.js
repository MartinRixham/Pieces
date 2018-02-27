define([
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavButton",
	"js/One",
	"js/Two",
	"js/Three",
	"js/Four",
	"js/Code"
], function(
	$,
	ScrollNavPiece,
	NavButton,
	One,
	Two,
	Three,
	Four,
	Code) {

	function Scroll() {

		this.onBind = function(element) {

			$(element).load("html/scroll.html");
		};

		this.scroll =
			new ScrollNavPiece([
				{ route: "one", page: new One() },
				{ route: "two", page: new Two() },
				{ route: "three", page: new Three() },
				{ route: "four", page: new Four() }]);

		this.menu =
			new Init(function(element) {

				$(element).sticky();
			});

		this.code = new Code("Scroll.js");
	}

	return Scroll;
});
