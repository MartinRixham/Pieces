define([], function NavPiece() {

	function NavPiece(pages) {

		var currentIndex = new Datum(-1);

		this.onBind = function(element) {

			var pageElement = document.createElement("DIV");
			pageElement.dataset.bind = "currentPage";

			element.appendChild(pageElement);
		};

		this.currentPage = null;

		this.showPage = function(index) {

			currentIndex(index);

			this.currentPage = pages[index].page;
		};

		this.getCurrentIndex = function() {

			return currentIndex();
		};
	}

	return NavPiece;
});
