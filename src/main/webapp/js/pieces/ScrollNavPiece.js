define(["./Route"], function(Route) {

	var route = new Route();

	function ScrollNavPiece(pages) {

		var activeIndex = new Datum(-1);

		this.pages = new Array(pages.length);

		for (var i = 0; i < pages.length; i++) {

			this.pages[i] = pages[i].page;
		}

		this.onBind = function(element) {

			var page = document.createElement("DIV");

			var container = document.createElement("DIV");
			container.dataset.bind = "pages";
			container.appendChild(page);

			element.appendChild(container);
		};

		this.showPage = function(index) {

			activeIndex(index);
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
