define([
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavButton",
	"js/One",
	"js/Two",
	"js/Three",
	"js/Four"
], function(
	$,
	ScrollNavPiece,
	NavButton,
	One,
	Two,
	Three,
	Four) {

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
	}

	return Scroll;
});
