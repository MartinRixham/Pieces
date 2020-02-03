define(["./CompoundWord"], function(CompoundWord) {

	function Subroute(route, getCurrentIndex, showPage) {

		var words = [];

		var scrollIndex = -1;

		var currentIndex = 0;

		this.setUpdating = function() {

			route.setUpdating();
		};

		this.addRoute = function(word, simple) {

			var self = this;

			if (scrollIndex == -1) {

				return route.addRoute(word);
			}

			var index = scrollIndex;

			scrollIndex = -1;

			for (var i = 0; i < words.length; i++) {

				if (!words[i].hasIndex(index)) {

					words[i].add(index, word);

					if (simple) {

						return words[i].getRouter();
					}
					else {

						return getRouter(words[i].getRouter(), index, function(index) {

							self.setIndex(index);
							showPage(index);
						});
					}
				}
			}

			var newWord = new CompoundWord(currentIndex);
			var router = route.addRoute(newWord);
			var newIndex = words.length;

			words[newIndex] = newWord;
			words[newIndex].setRouter(router);
			words[newIndex].add(index, word);

			if (simple) {

				return router;
			}
			else {

				return getRouter(router, index, function(index) {

					self.setIndex(index);
					showPage(index);
				});
			}
		};

		function getRouter(router, index, showPage) {

			return {

				setUpdating: function() {

					router.setUpdating();
				},
				changePage: function() {

					router.changePage();
				},
				update: function() {

					if (getCurrentIndex() == index) {

						router.update();
					}
					else {

						showPage(index);

						eventuallyUpdate(router, index, 100);
					}
				},
				getIndex: function() {

					return router.getIndex();
				}
			};
		}

		function eventuallyUpdate(router, index, retry) {

			if (getCurrentIndex() == index) {

				setTimeout(function() {

					router.update();
				}, 50);
			}
			else if (retry) {

				setTimeout(function() {

					eventuallyUpdate(router, index, --retry);
				}, 10);
			}
		}

		this.update = function(index) {

			route.update(index);
		};

		this.changePage = function(index) {

			route.changePage(index);
		};

		this.callHome = function(index) {

			scrollIndex = index;
		};

		this.setIndex = function(index) {

			currentIndex = index;

			for (var i = 0; i < words.length; i++) {

				words[i].setIndex(index);
			}
		};
	}

	return Subroute;
});
