define([
	"js/pieces/SlideNavPiece",
	"js/pieces/NavButton",
	"js/Router",
	"js/Links",
	"js/fade/Fade",
	"js/Scroll",
	"js/Code"
], function(
	SlideNavPiece,
	NavButton,
	Router,
	Links,
	Fade,
	Scroll,
	Code) {

	function App() {

		// Create navigation container with pages and routes.
		this.content =
			new SlideNavPiece([

				{ route: "router", page: new Router() },
				{ route: "fade", page: new Fade() },
				{ route: "scroll", page: new Scroll() },
				{ route: "code", page: new Links() }
			]);

		// Navigation buttons.
		this.router = new NavButton(0, this.content);
		this.three = new NavButton(1, this.content);
		this.scroll = new NavButton(2, this.content);
		this.links = new NavButton(3, this.content);

		// Modal dialog for showing this code (whoa meta!).
		this.code = new Code("App.js");
	}

	return App;
});
