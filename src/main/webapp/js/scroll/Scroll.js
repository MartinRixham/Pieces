define([
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavButton",
	"js/cities/Cities",
	"js/scroll/Two",
	"js/scroll/Three",
	"js/scroll/Four",
	"js/Code"
],
function(
	$,
	ScrollNavPiece,
	NavButton,
	Cities,
	Two,
	Three,
	Four,
	Code) {

	function Scroll() {

		this.onBind = function(element) {

			$(element).load("html/scroll/scroll.html");
		};

		// Create scroll navigation container.
		this.container =
			new ScrollNavPiece([

				{ route: "cities", page: new Cities() },
				{ route: "two", page: new Cities() },
				{ route: "three", page: new Three() },
				{ route: "four", page: new Four() }
			]);

		// Menu buttons.
		this.one = new NavButton(0, this.container);
		this.two = new NavButton(1, this.container);
		this.three = new NavButton(2, this.container);
		this.four = new NavButton(3, this.container);

		// The init binding is called to set up an element.
		this.menu =
			new Init(function(element) {

				// Use semantic UI to make the menu sticky.
				$(element).sticky();
			});

		this.code = new Code("scroll/Scroll.js");
	}

	return Scroll;
});
