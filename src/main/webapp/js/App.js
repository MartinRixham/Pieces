define([
	"js/pieces/NavPiece",
	"js/pieces/NavButton",
	"js/One",
	"js/Two",
	"js/NavCode"
], function(
	NavPiece,
	NavButton,
	One,
	Two,
	NavCode) {

	function App() {

		// Create navigation container with pages and routes.
		this.content =
			new NavPiece([

				{ route: "one", page: new One() },
				{ route: "two", page: new Two() }
			]);

		// Navigation buttons.
		this.one = new NavButton(0, this.content);
		this.two = new NavButton(1, this.content);

		// Modal dialog for showing this code (whoa meta!).
		this.navCode = new NavCode();
	}

	return App;
});
