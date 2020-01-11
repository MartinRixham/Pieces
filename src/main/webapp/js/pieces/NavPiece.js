define(["./Library", "./Route"], function NavPiece(Library, Route) {

	var route = new Route();

	function NavPiece(pages) {

		var self = this;

		var currentIndex = new Library.Datum(0);

		var activeIndex = new Library.Datum(-1);

		var routeIndex = -1;

		this.currentPage = pages[0].page;

		this.onBind = function(element) {

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");
			page.dataset.bind = "currentPage";

			element.appendChild(page);

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex, callback) {

						routePage(word, callback);
						route.update(routeIndex);
					},
					get: function() {

						return pages[currentIndex()].route;
					}
				});
		};

		function routePage(hash, callback) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					activeIndex(i);

					setPage(i, callback);

					return;
				}
			}

			activeIndex(-1);

			setPage(0, callback);
		}

		function setPage(index, callback) {

			if (self.currentPage == pages[index].page) {

				return;
			}

			callback();
			self.currentPage = pages[index].page;
			currentIndex(index);
		}

		this.showPage = function(index) {

			if (!pages[index]) {

				return;
			}

			activeIndex(index);

			var oldIndex = currentIndex();

			if (oldIndex != index) {

				route.changePage(routeIndex);
			}

			currentIndex(index);

			route.update(routeIndex);

			this.currentPage = pages[index].page;
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return NavPiece;
});
