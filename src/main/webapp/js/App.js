define([
	"js/pieces/SlideNavPiece",
	"js/pieces/NavButton",
	"js/One",
	"js/Two",
	"js/Three",
	"js/NavCode"
], function(
	SlideNavPiece,
	NavButton,
	One,
	Two,
	Three,
	NavCode) {

	function App() {

		// Create navigation container with pages and routes.
		this.content =
			new SlideNavPiece([

				{ route: "one", page: new One() },
				{ route: "two", page: new Two() },
				{ route: "three", page: new Three() }
			]);

		// Navigation buttons.
		this.one = new NavButton(0, this.content);
		this.two = new NavButton(1, this.content);
		this.three = new NavButton(2, this.content);

		// Modal dialog for showing this code (whoa meta!).
		this.navCode = new NavCode();
	}

	return App;
});
