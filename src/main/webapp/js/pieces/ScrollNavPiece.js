define(["./Route"], function(Route) {

	var route = new Route();

	function ScrollNavPiece(pages) {

		this.pages = [pages[0].page];

		this.getCurrentIndex = function() {

			return -1;
		};
	}

	return ScrollNavPiece;
});
