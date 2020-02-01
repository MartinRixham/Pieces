define([
	"jquery",
	"js/pieces/ScrollNavPiece",
	"js/pieces/NavButton",
	"js/Cities",
	"js/Rainbow",
	"js/Space",
	"js/Vegetables",
	"js/Code"
],
function(
	$,
	ScrollNavPiece,
	NavButton,
	Cities,
	Rainbow,
	Space,
	Vegetables,
	Code) {

	function Scroll() {

		this.onBind = function(element) {

			$(element).load("html/scroll.html");
		};

		// Create scroll navigation container.
		this.container =
			new ScrollNavPiece([

				{ route: "cities", page: new Cities() },
				{ route: "rainbow", page: new Rainbow() },
				{ route: "vegetables", page: new Vegetables() },
				{ route: "space", page: new Space() }
			]);

		// Menu buttons.
		this.one = new NavButton(0, this.container);
		this.two = new NavButton(1, this.container);
		this.three = new NavButton(2, this.container);
		this.four = new NavButton(3, this.container);

		// The init callback is called to set up an element.
		this.menu =
			new Init(function(element) {

				// Use semantic UI to make the menu sticky.
				$(element).sticky();
			});

		this.code = new Code("Scroll.js");
	}

	return Scroll;
});
