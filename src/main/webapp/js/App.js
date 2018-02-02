define([
	"pieces/NavPiece",
	"pieces/NavButton",
	"One",
	"Two"
], function(
	NavPiece,
	NavButton,
	One,
	Two) {

	function App() {

		this.content =
			new NavPiece([

				{ route: "one", page: new One() },
				{ route: "two", page: new Two() }
			]);

		this.one = new NavButton(0, this.content);
		this.two = new NavButton(1, this.content);
	}

	return App;
});
