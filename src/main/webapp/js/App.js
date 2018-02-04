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

		this.content =
			new NavPiece([

				{ route: "one", page: new One() },
				{ route: "two", page: new Two() }
			]);

		this.one = new NavButton(0, this.content);
		this.two = new NavButton(1, this.content);

		this.navCode = new NavCode();
	}

	return App;
});
