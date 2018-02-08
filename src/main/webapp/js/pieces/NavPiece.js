define([], function NavPiece() {

	function NavPiece(pages) {

		var currentIndex = new Datum(-1);

		this.currentPage = pages[0].page;

		(function routePage(self) {

			for (var i = 0; i < pages.length; i++) {

				if ("#" + pages[i].route == location.hash) {

					self.currentPage = pages[i].page;
				}
			}
		})(this);

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			var pageElement = document.createElement("DIV");
			pageElement.dataset.bind = "currentPage";

			element.appendChild(pageElement);
		};

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			currentIndex(index);

			this.currentPage = pages[index].page;

			location.hash = pages[index].route;
		};

		this.getCurrentIndex = function() {

			return currentIndex();
		};
	}

	return NavPiece;
});
