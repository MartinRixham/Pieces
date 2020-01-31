define([
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavButton",
	"js/Cities",
	"js/Vegetables",
	"js/Space",
	"js/Code"
],
function(
	$,
	ScrollNavPiece,
	NavButton,
	Cities,
	Vegetables,
	Space,
	Code) {

	function Scroll() {

		this.onBind = function(element) {

			$(element).load("html/scroll.html");
		};

		// Create scroll navigation container.
		this.container =
			new ScrollNavPiece([

				{ route: "cities", page: new Cities() },
				{ route: "vegetables", page: new Vegetables() },
				{ route: "space", page: new Space() },
				{ route: "four", page: new Cities() }
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

		this.code = new Code("Scroll.js");
	}

	return Scroll;
});