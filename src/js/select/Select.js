define([
	"jquery",
	"js/pieces/SelectNavPiece"],
function(
	$,
	SelectNavPiece) {

	function Select() {

		this.onBind = function(element) {

			$(element).load("html/select/select.html");
		};

		this.container =
			new SelectNavPiece([

				{ route: "one", page: new One() },
				{ route: "two", page: new Two() },
				{ route: "three", page: new Three() },
				{ route: "four", page: new Four() },
			]);
	}

	return Select;
});
