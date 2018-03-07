define([
	"js/pieces/SlideNavPiece",
	"js/pieces/NavButton",
	"js/Router",
	"js/Two",
	"js/Fade",
	"js/Scroll",
	"js/Code"
], function(
	SlideNavPiece,
	NavButton,
	Router,
	Two,
	Fade,
	Scroll,
	Code) {

	function App() {

		// Create navigation container with pages and routes.
		this.content =
			new SlideNavPiece([

				{ route: "router", page: new Router() },
				{ route: "two", page: new Two() },
				{ route: "fade", page: new Fade() },
				{ route: "scroll", page: new Scroll() }
			]);

		// Navigation buttons.
		this.router = new NavButton(0, this.content);
		this.two = new NavButton(1, this.content);
		this.three = new NavButton(2, this.content);
		this.scroll = new NavButton(3, this.content);

		// Modal dialog for showing this code (whoa meta!).
		this.code = new Code("App.js");
	}

	return App;
});
